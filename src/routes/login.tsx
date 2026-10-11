import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GROK_PROVIDERS, authClient, authEnabled, getBearerToken, rememberSessionToken, sessionTokenFromAuthResponse, signIn } from "@/lib/auth/client";
import { Logo } from "@/components/cinevo/logo";
import { PasskeyCeremony, PasskeyLogin } from "@/components/cinevo/passkey-login";
import { claimUsername, suggestUsername } from "@/lib/sharing";
import { appDestination } from "@/lib/app-destination";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "up" ? ("up" as const) : ("in" as const),
    ...(typeof search.desk === "string" && /^[A-Za-z0-9_-]{20,80}$/.test(search.desk) ? { desk: search.desk } : {}),
    ...(typeof search.error === "string" && search.error && search.error !== "1" && search.error !== "access_denied"
      ? { error: search.error }
      : {}),
    ...(typeof search.ceremony === "string" && search.ceremony === "passkey" && typeof search.id === "string"
      ? { ceremony: "passkey" as const, id: search.id }
      : {}),
    ...appDestination(search),
  }),
  component: Login,
});

function readableAuthError(message: string | undefined, signingUp: boolean) {
  const text = (message || "").toLowerCase();
  if (text.includes("already") || text.includes("exist")) return "That email already has a house. Sign in instead.";
  if (text.includes("password") && text.includes("invalid")) return "Email or password did not match.";
  if (text.includes("password")) return "Use a password of at least 8 characters.";
  if (text.includes("origin")) return "This page could not confirm its address. Reload and try again.";
  return message || (signingUp ? "Could not create that account." : "Email or password did not match.");
}

function deskFromLocation() {
  if (typeof window === "undefined") return "";
  const raw = new URLSearchParams(window.location.search).get("desk") || "";
  return /^[A-Za-z0-9_-]{20,80}$/.test(raw) ? raw : "";
}

function Login() {
  const { mode: initial, room, core, desk, error: oauthError, ceremony, id } = Route.useSearch();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">(initial);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setMode(initial);
  }, [initial]);

  useEffect(() => {
    if (!oauthError || oauthError === "1" || oauthError === "access_denied") return;
    setError("Google or X did not finish signing in. Try again, or use a passkey.");
  }, [oauthError]);

  const goHouse = () => {
    const params = new URLSearchParams();
    if (room) params.set("room", room);
    if (core) params.set("core", core);
    window.location.assign(`/app${params.size ? `?${params}` : ""}`);
  };

  const signedIn = Boolean(user && !user.isDevFallback);

  useEffect(() => {
    if (isPending || !signedIn) return;
    let cancel = false;
    const secret = desk || deskFromLocation();
    void (async () => {
      if (secret) {
        const token = getBearerToken();
        try {
          const approved = await fetch("/api/passkey", {
            method: "POST",
            credentials: "include",
            headers: {
              "content-type": "application/json",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ action: "approve", secret }),
          });
          if (!approved.ok && !cancel) {
            const failed = (await approved.json().catch(() => null)) as { error?: string } | null;
            setError(failed?.error || "Could not sign in the other screen.");
          }
        } catch {
          if (!cancel) setError("Could not sign in the other screen.");
        }
      }
      if (cancel) return;
      const params = new URLSearchParams();
      if (room) params.set("room", room);
      if (core) params.set("core", core);
      window.location.replace(`/app${params.size ? `?${params}` : ""}`);
    })();
    return () => {
      cancel = true;
    };
  }, [isPending, signedIn, desk, room, core]);

  const afterEmail = async (name: string) => {
    const typed = name.trim();
    const handle = typed || suggestUsername(email);
    if (handle) {
      try {
        const first = await claimUsername({ data: { username: handle, display: typed || handle } });
        if (!first.ok && !typed) {
          const alt = `${handle.slice(0, 14)}${String(Date.now()).slice(-2)}`;
          await claimUsername({ data: { username: alt, display: alt } });
        }
      } catch {
        /* UsernameGate will retry on /app */
      }
    }
    goHouse();
  };

  const confirmSession = async (token: string | null) => {
    const headers = new Headers();
    if (token) headers.set("authorization", `Bearer ${token}`);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch("/api/auth/get-session", { credentials: "include", headers, cache: "no-store" });
        const body = (await res.json().catch(() => null)) as { user?: { id?: string } } | null;
        if (res.ok && body?.user?.id) return true;
      } catch {
        /* try once more */
      }
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    return false;
  };

  const enterHouse = async (token: string | null, name: string) => {
    const signed = sessionTokenFromAuthResponse(token);
    if (signed) rememberSessionToken(signed);
    const kept = await confirmSession(signed);
    if (!kept) return false;
    void authClient.getSession();
    const secret = desk || deskFromLocation();
    if (secret) {
      const bearer = getBearerToken() || signed;
      try {
        const approved = await fetch("/api/passkey", {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
          },
          body: JSON.stringify({ action: "approve", secret }),
        });
        if (!approved.ok) {
          const failed = (await approved.json().catch(() => null)) as { error?: string } | null;
          setError(failed?.error || "Could not sign in the other screen.");
        }
      } catch {
        setError("Could not sign in the other screen.");
      }
    }
    await afterEmail(name);
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const cleanEmail = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError("Enter a valid email.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password of at least 8 characters.");
      return;
    }
    if (mode === "up" && username.trim() && !/^[A-Za-z][A-Za-z0-9_]{2,19}$/.test(username.trim())) {
      setError("Username: 3–20 characters, starting with a letter. Letters, numbers, and underscores only.");
      return;
    }
    setPending(true);
    rememberSessionToken(null);
    let captured: string | null = null;
    const fetchOptions = {
      onSuccess(context: { response: Response }) {
        captured = sessionTokenFromAuthResponse(context.response.headers.get("set-auth-token"));
      },
    };
    try {
      if (mode === "up") {
        const { data, error: err } = await authClient.signUp.email({
          email: cleanEmail,
          password,
          name: username.trim() || cleanEmail.split("@")[0] || "Member",
          fetchOptions,
        });
        if (err) {
          setError(readableAuthError(err.message, true));
          if ((err.message || "").toLowerCase().includes("exist")) setMode("in");
          return;
        }
        rememberSessionToken(captured || (data && "token" in data ? String(data.token ?? "") : null) || null);
        const kept = await enterHouse(captured || (data && "token" in data ? String(data.token ?? "") : null), username);
        if (!kept) {
          setError("The account was created, but this browser did not keep the sign-in. Try signing in.");
          setMode("in");
        }
      } else {
        const { data, error: err } = await authClient.signIn.email({
          email: cleanEmail,
          password,
          fetchOptions,
        });
        if (err) {
          setError(readableAuthError(err.message, false));
          return;
        }
        rememberSessionToken(captured || (data && "token" in data ? String(data.token ?? "") : null) || null);
        const kept = await enterHouse(captured || (data && "token" in data ? String(data.token ?? "") : null), "");
        if (!kept) setError("The password matched, but this browser did not keep the sign-in. Reload and try again.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    } finally {
      setPending(false);
    }
  };

  if (ceremony === "passkey" && id) return <PasskeyCeremony id={id} />;

  if (isPending || signedIn) {
    return (
      <main className="login-stage">
        <div className="login-card" aria-busy="true">
          <div className="h-8 w-28 animate-pulse rounded bg-cine-surface" />
          <div className="mt-6 h-10 w-56 animate-pulse rounded bg-cine-surface" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-cine-surface" />
          <div className="mt-8 h-12 w-full animate-pulse rounded-xl bg-cine-surface" />
          <div className="mt-2 h-12 w-full animate-pulse rounded-xl bg-cine-surface" />
        </div>
      </main>
    );
  }

  return (
    <main className="login-stage">
      <div className="login-card">
        <Link to="/" className="login-brand">
          <Logo size="lg" layout="stacked" />
        </Link>
        <h1>{mode === "up" ? "Create your house." : "Take your seat."}</h1>
        <p className="login-lede">
          {desk
            ? "Sign in on this phone. The other screen follows you in."
            : mode === "up"
              ? "Add an email, then a passkey or a password."
              : "A passkey or a QR code. A password works too."}
        </p>

        {authEnabled ? (
          <>
            <form onSubmit={(e) => void submit(e)} className="login-form">
              {mode === "up" ? (
                <>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Username (optional)"
                    autoComplete="username"
                    aria-label="Username"
                    maxLength={20}
                    title="3–20 letters, numbers, or underscores, starting with a letter"
                    className="login-field"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    required
                    aria-label="Email"
                    className="login-field"
                  />
                </>
              ) : null}
              {mode === "up" ? (
                <p className="login-hint">Create your account with a password or Google/X first. Once signed in, you can add a passkey in your account settings.</p>
              ) : (
                <PasskeyLogin
                  mode={mode}
                  email={email}
                  name={username || email.split("@")[0] || ""}
                  desk={desk}
                  onAuthed={async (token) => {
                    const kept = await enterHouse(token, username);
                    if (!kept) setError("The passkey matched, but this browser did not keep the sign-in. Reload and try again.");
                  }}
                />
              )}
              {error ? <p className="text-sm text-cine-danger">{error}</p> : null}
              <p className="login-split">or password</p>
              {mode === "in" ? (
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  required
                  aria-label="Email"
                  className="login-field"
                />
              ) : null}
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete={mode === "up" ? "new-password" : "current-password"}
                required
                minLength={8}
                aria-label="Password"
                className="login-field"
              />
              {mode === "up" ? <p className="login-hint">Password at least 8 characters. Username is optional.</p> : null}
              <button type="submit" disabled={pending} className="house-btn house-btn--ghost h-12 w-full">
                {pending ? "Working…" : mode === "up" ? "Create account with password" : "Sign in with password"}
              </button>
            </form>
            <button
              type="button"
              className="login-switch"
              onClick={() => {
                setMode(mode === "up" ? "in" : "up");
                setError("");
              }}
            >
              {mode === "up" ? "Already have a house? Sign in" : "New here? Create an account"}
            </button>
            <div className="login-social">
              {GROK_PROVIDERS.map((p) => (
                <button
                  key={p.providerId}
                  type="button"
                  onClick={() => {
                    void signIn(p.providerId, {
                      callbackURL: `/app${room || core ? `?${new URLSearchParams({ ...(room ? { room } : {}), ...(core ? { core } : {}) }).toString()}` : ""}`,
                    }).catch((err: unknown) => {
                      setError(err instanceof Error ? err.message : "Could not start that sign-in.");
                    });
                  }}
                  className="login-social__btn"
                >
                  Continue with {p.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-8 text-sm text-cine-muted">Sign-in is disabled.</p>
        )}
      </div>
      <p className="login-credit">
        CINEVO - a{" "}
        <a href="https://www.fourtee2.digital" target="_blank" rel="noreferrer">
          fourtee2digital
        </a>{" "}
        project
      </p>
    </main>
  );
}
