import { useEffect, useRef, useState } from "react";
import { renderSVG } from "uqr";
import { getBearerToken } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { b64urlToBytes, bytesToB64url, isIpHost } from "@/lib/passkey-crypto";
import { createDeviceAssertion, devicePasskeyIds, signDevicePasskey } from "@/lib/device-passkey";

type Challenge = { challengeId: string; challenge: string; rpId: string };

async function postPasskey(body: Record<string, string>) {
  const token = getBearerToken();
  const res = await fetch("/api/passkey", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as {
    error?: string;
    token?: string;
    challengeId?: string;
    challenge?: string;
    rpId?: string;
    secret?: string;
  };
  if (!res.ok || data.error) throw new Error(data.error || "Passkey failed.");
  return data;
}

function bufferOf(value: string): ArrayBuffer {
  const bytes = b64urlToBytes(value);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function fromBuffer(value: ArrayBuffer) {
  return bytesToB64url(new Uint8Array(value));
}

async function challenge(): Promise<Challenge> {
  const data = await postPasskey({ action: "challenge" });
  if (!data.challengeId || !data.challenge || !data.rpId) throw new Error("Could not start a passkey.");
  return { challengeId: data.challengeId, challenge: data.challenge, rpId: data.rpId };
}

export async function registerPasskeyInBrowser(email: string, name: string) {
  const createdChallenge = await challenge();
  const created = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "CINEVO", id: createdChallenge.rpId },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: email.trim(),
        displayName: name.trim() || email.trim(),
      },
      challenge: bufferOf(createdChallenge.challenge),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      timeout: 60_000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;
  if (!created) throw new Error("The passkey prompt was closed.");
  const attestation = created.response as AuthenticatorAttestationResponse;
  const publicKey = attestation.getPublicKey();
  if (!publicKey) throw new Error("This browser could not save a passkey. Use email instead.");
  const fresh = await challenge();
  const signed = (await navigator.credentials.get({
    publicKey: {
      challenge: bufferOf(fresh.challenge),
      rpId: fresh.rpId,
      allowCredentials: [{ type: "public-key", id: created.rawId }],
      userVerification: "preferred",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!signed) throw new Error("The passkey prompt was closed.");
  const signedBody = signed.response as AuthenticatorAssertionResponse;
  const data = await postPasskey({
    action: "register",
    challengeId: fresh.challengeId,
    email: email.trim(),
    name: name.trim(),
    credentialId: fromBuffer(created.rawId),
    publicKey: fromBuffer(publicKey),
    algorithm: String(attestation.getPublicKeyAlgorithm()),
    clientDataJSON: fromBuffer(signedBody.clientDataJSON),
    authenticatorData: fromBuffer(signedBody.authenticatorData),
    signature: fromBuffer(signedBody.signature),
  });
  if (!data.token) throw new Error("The account was created, but this browser did not keep the sign-in.");
  return data.token;
}

const CEREMONY_KEY = "cinevo-passkey-request";

function credentialBlocked(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /notallowed|not allowed|security|invalidstate|cross-origin|abort/i.test(message);
}

async function nativeToken(mode: "in" | "up", email: string, name: string) {
  if (mode === "up") return registerPasskeyInBrowser(email, name);
  const next = await challenge();
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: bufferOf(next.challenge),
      rpId: next.rpId,
      userVerification: "preferred",
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("The passkey prompt was closed.");
  const assertion = credential.response as AuthenticatorAssertionResponse;
  const data = await postPasskey({
    action: "login",
    challengeId: next.challengeId,
    credentialId: fromBuffer(credential.rawId),
    clientDataJSON: fromBuffer(assertion.clientDataJSON),
    authenticatorData: fromBuffer(assertion.authenticatorData),
    signature: fromBuffer(assertion.signature),
  });
  if (!data.token) throw new Error("The passkey matched, but this browser did not keep the sign-in.");
  return data.token;
}

async function deviceToken(mode: "in" | "up", email: string, name: string) {
  const origin = window.location.origin;
  if (mode === "up") {
    const next = await challenge();
    const signed = await createDeviceAssertion(origin, next.rpId, next.challenge);
    const data = await postPasskey({
      action: "register",
      challengeId: next.challengeId,
      email: email.trim(),
      name: name.trim(),
      credentialId: signed.credentialId,
      publicKey: signed.publicKey,
      algorithm: signed.algorithm,
      clientDataJSON: signed.clientDataJSON,
      authenticatorData: signed.authenticatorData,
      signature: signed.signature,
    });
    if (!data.token) throw new Error("The account was created, but this browser did not keep the sign-in.");
    return data.token;
  }
  const ids = await devicePasskeyIds();
  if (!ids.length) throw new Error("No passkey on this browser yet. Create one first.");
  let last = "No passkey on this browser matches this house.";
  for (const id of ids) {
    const next = await challenge();
    const signed = await signDevicePasskey(id, origin, next.rpId, next.challenge);
    try {
      const data = await postPasskey({
        action: "login",
        challengeId: next.challengeId,
        credentialId: signed.credentialId,
        clientDataJSON: signed.clientDataJSON,
        authenticatorData: signed.authenticatorData,
        signature: signed.signature,
      });
      if (data.token) return data.token;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
  }
  throw new Error(last);
}

function waitForCeremony(id: string, popup: Window) {
  return new Promise<string | "cancelled">((resolve) => {
    let settled = false;
    const finish = (value: string | "cancelled") => {
      if (settled) return;
      settled = true;
      window.clearInterval(timer);
      window.removeEventListener("message", onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { source?: string; id?: string; token?: string; cancelled?: boolean };
      if (!data || data.source !== "cinevo-passkey" || data.id !== id) return;
      finish(data.token || "cancelled");
    };
    const timer = window.setInterval(() => {
      if (popup.closed) window.setTimeout(() => finish("cancelled"), 400);
    }, 300);
    window.addEventListener("message", onMessage);
  });
}

async function passkeyToken(mode: "in" | "up", email: string, name: string) {
  const ip = isIpHost(window.location.hostname);
  const framed = window.self !== window.top;
  if (!ip && "PublicKeyCredential" in window) {
    if (framed) {
      const id = crypto.randomUUID();
      localStorage.setItem(CEREMONY_KEY, JSON.stringify({ id, mode, email, name }));
      const popup = window.open(`/login?ceremony=passkey&id=${id}`, `cinevo-passkey-${id}`, "popup,width=460,height=640");
      if (popup) {
        const token = await waitForCeremony(id, popup);
        if (token === "cancelled") throw new Error("The passkey prompt was closed.");
        return token;
      }
    } else {
      try {
        return await nativeToken(mode, email, name);
      } catch (error) {
        if (!credentialBlocked(error)) throw error;
        const message = error instanceof Error ? error.message : "";
        if (/notallowed|abort|closed/i.test(message)) throw new Error("The passkey prompt was closed.");
      }
    }
  }
  return deviceToken(mode, email, name);
}

export function PasskeyCeremony({ id }: { id: string }) {
  const [message, setMessage] = useState("Approve the passkey prompt.");
  useEffect(() => {
    const raw = localStorage.getItem(CEREMONY_KEY);
    const request = raw ? (JSON.parse(raw) as { id?: string; mode?: "in" | "up"; email?: string; name?: string }) : null;
    const post = (body: { token?: string; cancelled?: boolean }) => {
      window.opener?.postMessage({ source: "cinevo-passkey", id, ...body }, window.location.origin);
      window.close();
    };
    if (!request || request.id !== id) {
      setMessage("This passkey window expired. Close it and try again.");
      return;
    }
    void nativeToken(request.mode === "up" ? "up" : "in", request.email || "", request.name || "")
      .then((token) => post({ token }))
      .catch((error: unknown) => {
        const text = error instanceof Error ? error.message : "";
        if (credentialBlocked(error) || /closed/i.test(text)) {
          void deviceToken(request.mode === "up" ? "up" : "in", request.email || "", request.name || "")
            .then((token) => post({ token }))
            .catch(() => post({ cancelled: true }));
          return;
        }
        post({ cancelled: true });
      });
  }, [id]);
  return (
    <main className="login-stage">
      <div className="login-card">
        <h1>Passkey</h1>
        <p className="login-lede">{message}</p>
      </div>
    </main>
  );
}

export function PasskeyLogin({
  mode,
  email,
  name,
  desk,
  onAuthed,
}: {
  mode: "in" | "up";
  email: string;
  name: string;
  desk?: string;
  onAuthed: (token: string) => Promise<void>;
}) {
  const onAuthedRef = useRef(onAuthed);
  onAuthedRef.current = onAuthed;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [supported, setSupported] = useState(true);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "PublicKeyCredential" in window);
  }, []);

  useEffect(() => {
    if (desk) return;
    let stop = false;
    void postPasskey({ action: "desk" })
      .then((data) => {
        if (stop || !data.secret) return;
        setSecret(data.secret);
        const url = `${window.location.origin}/login?desk=${data.secret}`;
        setQr(renderSVG(url, { ecc: "M", border: 2, pixelSize: 4, blackColor: "#041018", whiteColor: "#f4fbff" }));
      })
      .catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [desk]);

  useEffect(() => {
    if (!secret) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/passkey?desk=${encodeURIComponent(secret)}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((data: { status?: string; token?: string }) => {
          if (data.status === "approved" && data.token) {
            window.clearInterval(timer);
            void onAuthedRef.current(data.token);
          }
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [secret]);

  const run = async () => {
    setError("");
    if (mode === "up" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter the email for this house, then create the passkey.");
      return;
    }
    setPending(true);
    try {
      const token = await passkeyToken(mode, email, name);
      await onAuthed(token);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Passkey failed.";
      if (!/closed/i.test(message)) setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="passkey-block">
      {desk ? <p className="passkey-note">This phone will sign in the other screen.</p> : null}
      <button type="button" className="house-btn house-btn--play h-12 w-full" disabled={pending} onClick={() => void run()}>
        {pending ? "Waiting for the passkey…" : mode === "up" ? "Create a passkey" : "Sign in with a passkey"}
      </button>
      {mode === "up" && !desk ? <p className="passkey-note passkey-note--hint">Your browser asks twice: once to save the key, once to prove it.</p> : null}
      {error ? <p className="text-sm text-cine-danger">{error}</p> : null}
      {!supported && isIpHost(window.location.hostname) ? null : !supported ? (
        <p className="passkey-note">This browser has no platform passkey. CINEVO will keep one on this browser instead.</p>
      ) : null}
      {qr && !desk ? (
        <div className="passkey-qr">
          <button type="button" className="passkey-qr__toggle" onClick={() => setShowQr((open) => !open)}>
            {showQr ? "Hide QR code" : "Sign in with a QR code"}
          </button>
          {showQr ? (
            <div className="passkey-qr__sheet">
              <div dangerouslySetInnerHTML={{ __html: qr }} />
              <p>Scan with a phone that is already signed in to this house. Approve there, and this screen uses the same account.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AddPasskey({ compact = false }: { compact?: boolean }) {
  const { user, isPending } = useCurrentUserState();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  if (isPending || !user || user.isDevFallback || !user.primaryEmail) return null;

  const add = async () => {
    setError("");
    setPending(true);
    try {
      await passkeyToken("up", user.primaryEmail || "", user.displayName || "");
      setDone(true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not add a passkey.";
      if (!/closed/i.test(message)) setError(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={compact ? "account-passkey" : "tool-card"}>
      {compact ? null : <p className="font-ui text-xs font-semibold tracking-[0.12em] text-cine-cyan">ACCOUNT</p>}
      {compact ? null : <h2>Passkey</h2>}
      <p>{compact ? "Add a passkey so the next sign-in can skip the password." : "Add a passkey to this account. The next sign-in can use that key, or a phone QR code, instead of the password."}</p>
      {done ? <p>This account now has a passkey.</p> : null}
      {error ? <p className="text-sm text-cine-danger">{error}</p> : null}
      <button type="button" className="house-btn house-btn--ghost h-11 w-full" disabled={pending || done} onClick={() => void add()}>
        {pending ? "Waiting for the passkey…" : done ? "Passkey added" : "Add a passkey"}
      </button>
    </section>
  );
}
