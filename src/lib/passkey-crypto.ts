/** WebAuthn helpers. Registration stores the SPKI public key the browser reports.
 * Login is accepted only when that key verifies the authenticator signature. */

export function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function trimTo(bytes: Uint8Array, size: number): Uint8Array {
  let start = 0;
  while (start < bytes.length - 1 && bytes[start] === 0) start += 1;
  const sliced = bytes.slice(start);
  if (sliced.length > size) throw new Error("WebAuthn signature is the wrong size.");
  const out = new Uint8Array(size);
  out.set(sliced, size - sliced.length);
  return out;
}

/** WebAuthn ECDSA signatures are ASN.1 DER. WebCrypto wants raw r||s. */
export function derSigToRaw(der: Uint8Array, size = 32): Uint8Array {
  if (der.length === size * 2) return der;
  if (der[0] !== 0x30) throw new Error("WebAuthn signature is not a signature.");
  let offset = 2;
  if (der[1] & 0x80) offset = 2 + (der[1] & 0x7f);
  if (der[offset] !== 0x02) throw new Error("WebAuthn signature is not a signature.");
  const rLen = der[offset + 1];
  const r = der.slice(offset + 2, offset + 2 + rLen);
  offset += 2 + rLen;
  if (der[offset] !== 0x02) throw new Error("WebAuthn signature is not a signature.");
  const sLen = der[offset + 1];
  const s = der.slice(offset + 2, offset + 2 + sLen);
  const raw = new Uint8Array(size * 2);
  raw.set(trimTo(r, size), 0);
  raw.set(trimTo(s, size), size);
  return raw;
}

function copyBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(data.byteLength));
  copy.set(data);
  return copy;
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", copyBytes(data)));
}

function isIpHost(hostname: string) {
  return hostname.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

export { isIpHost };

/** Platform passkeys reject an IP relying party. This house uses a browser key there instead. */
export function passkeyHostError(_hostname: string): string | null {
  return null;
}

export function pageOrigin(request: Request): { origin: string; rpId: string } | null {
  const header = request.headers.get("origin");
  if (!header) return null;
  let url: URL;
  try {
    url = new URL(header);
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || isIpHost(url.hostname);
  if (url.protocol !== "https:" && !local) return null;
  return { origin: url.origin, rpId: url.hostname };
}

export async function verifyAssertion(input: {
  publicKeySpki: Uint8Array;
  algorithm: number;
  authenticatorData: Uint8Array;
  clientDataJSON: Uint8Array;
  signature: Uint8Array;
  challenge: string;
  origin: string;
  rpId: string;
}): Promise<{ signCount: number }> {
  if (input.authenticatorData.length < 37) throw new Error("Passkey response was incomplete.");
  const client = JSON.parse(new TextDecoder().decode(input.clientDataJSON)) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };
  if (client.type !== "webauthn.get") throw new Error("Passkey response was not a sign-in.");
  if (client.challenge !== input.challenge) throw new Error("Passkey challenge did not match. Try again.");
  if (client.origin !== input.origin) throw new Error("Passkey was made for a different address.");
  const rpHash = await sha256(new TextEncoder().encode(input.rpId));
  const got = input.authenticatorData.slice(0, 32);
  if (rpHash.length !== got.length || rpHash.some((byte, i) => byte !== got[i])) {
    throw new Error("Passkey was made for a different address.");
  }
  if ((input.authenticatorData[32] & 0x01) === 0) throw new Error("The passkey was not approved.");
  const signCount = new DataView(input.authenticatorData.buffer, input.authenticatorData.byteOffset + 33, 4).getUint32(0);
  const hash = await sha256(input.clientDataJSON);
  const signed = new Uint8Array(input.authenticatorData.length + hash.length);
  signed.set(input.authenticatorData, 0);
  signed.set(hash, input.authenticatorData.length);
  const key = await crypto.subtle.importKey(
    "spki",
    copyBytes(input.publicKeySpki),
    input.algorithm === -257
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
  const signature = input.algorithm === -257 ? copyBytes(input.signature) : derSigToRaw(input.signature);
  const ok = await crypto.subtle.verify(
    input.algorithm === -257 ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" },
    key,
    copyBytes(signature),
    copyBytes(signed),
  );
  if (!ok) throw new Error("That passkey does not match this house.");
  return { signCount };
}
