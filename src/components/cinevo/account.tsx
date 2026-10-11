import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { authClient, signOut } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getAccountSettings, saveAccountSettings } from "@/lib/account-settings";
import { claimUsername, getMyProfile, suggestUsername } from "@/lib/sharing";
import { useCinevo } from "@/lib/cinevo-store";
import { AddPasskey } from "./passkey-login";
import { cn } from "@/lib/utils";

export function AuthSlot({ className }: { className?: string }) {
  const { user, isPending } = useCurrentUserState();
  const setSettingsOpen = useCinevo((s) => s.setSettingsOpen);
  if (isPending) return <div className={cn("size-9 shrink-0 animate-pulse rounded-full bg-cine-surface", className)} />;
  if (!user) {
    return (
      <Link
        to="/login"
        search={{ mode: "in" }}
        className={cn(
          "inline-flex h-11 items-center rounded-full border border-cine-line px-3 font-ui text-xs font-bold uppercase tracking-wider text-cine-text",
          className,
        )}
      >
        Sign in
      </Link>
    );
  }
  const label = user.displayName || user.primaryEmail || "Account";
  return (
    <button type="button" className={cn("account-chip", className)} aria-label="Account settings" onClick={() => setSettingsOpen(true)}>
      <span className="account-chip__mark" aria-hidden="true">
        {label.charAt(0).toUpperCase()}
      </span>
      <span className="account-chip__name">{label}</span>
    </button>
  );
}

export function AccountSettings() {
  const { user, isPending } = useCurrentUserState();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [hasPassword, setHasPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const touched = useRef(false);
  const [loaded, setLoaded] = useState(false);
  const userId = user?.id;

  useEffect(() => {
    if (isPending || !userId || user?.isDevFallback) return;
    let cancel = false;
    void getAccountSettings()
      .then((res) => {
        if (cancel || touched.current || !res.ok) return;
        setName(res.name);
        setUsername(res.username);
        setEmail(res.email);
        setHasPassword(res.hasPassword);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancel) setError("Could not load this account.");
      });
    return () => {
      cancel = true;
    };
  }, [isPending, userId, user?.isDevFallback]);

  if (isPending || !user || user.isDevFallback) return null;

  const save = async () => {
    setPending(true);
    setError("");
    setNote("");
    try {
      const res = await saveAccountSettings({
        data: {
          name,
          email,
          username,
          currentPassword,
          newPassword,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      if (newPassword.trim()) setHasPassword(true);
      setNote("Saved.");
      if (name.trim()) void authClient.updateUser({ name: name.trim() });
      void authClient.getSession();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save those settings.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form
      className="account-settings"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="font-ui text-xs font-semibold tracking-[0.12em] text-cine-cyan">ACCOUNT</p>
      <h3 className="font-ui text-lg font-semibold tracking-tight">This house</h3>
      {!loaded ? <p className="account-settings__note">Loading account…</p> : null}
      <label>
        <span>Name</span>
        <input value={name} onChange={(e) => { touched.current = true; setName(e.target.value); }} autoComplete="name" maxLength={40} className="login-field" />
      </label>
      <label>
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => { touched.current = true; setUsername(e.target.value); }}
          autoComplete="username"
          maxLength={20}
          placeholder="letters, numbers, underscore"
          className="login-field"
        />
      </label>
      <label>
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => {
            touched.current = true;
            setEmail(e.target.value);
          }}
          autoComplete="email"
          aria-label="Email"
          className="login-field"
        />
      </label>
      {hasPassword ? (
        <label>
          <span>Current password</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="login-field"
          />
        </label>
      ) : (
        <p className="account-settings__note">This house has a passkey and no password yet. Add one below if you want email sign-in.</p>
      )}
      <label>
        <span>{hasPassword ? "New password" : "Password"}</span>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          placeholder={hasPassword ? "Leave blank to keep the current one" : "At least 8 characters"}
          className="login-field"
        />
      </label>
      {error ? <p className="text-sm text-cine-danger">{error}</p> : null}
      {note ? <p className="account-settings__note">{note}</p> : null}
      <button type="submit" className="house-btn house-btn--play h-11 w-full" disabled={pending}>
        {pending ? "Saving…" : "Save account"}
      </button>
      <AddPasskey compact />
      <button
        type="button"
        className="house-btn house-btn--ghost h-11 w-full"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          void signOut("/").catch(() => setSigningOut(false));
        }}
      >
        {signingOut ? "Signing out…" : "Sign out"}
      </button>
    </form>
  );
}

export function LandingAuth() {
  const { user, isPending } = useCurrentUserState();
  if (isPending || !user) {
    return (
      <div className="flex items-center gap-2">
        <Link to="/login" search={{ mode: "in" }} className="public-nav__signin max-md:hidden">
          Sign in
        </Link>
        <Link to="/login" search={{ mode: "up" }} className="public-nav__enter">
          Create account
        </Link>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link to="/app" className="public-nav__enter">
        Enter house
      </Link>
      <div className="cinevo-account max-md:hidden">
        <UserButton />
      </div>
    </div>
  );
}

export function UsernameGate() {
  const { user, isPending } = useCurrentUserState();
  const [needed, setNeeded] = useState(false);
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const ticket = useRef(0);

  useEffect(() => {
    if (isPending || !user || user.isDevFallback) return;
    if (typeof window !== "undefined" && window.sessionStorage.getItem("cinevo-username-later") === "1") return;
    let cancelled = false;
    const check = async () => {
      const mine = ++ticket.current;
      try {
        const res = await getMyProfile();
        if (cancelled || mine !== ticket.current) return;
        if (window.sessionStorage.getItem("cinevo-username-later") === "1") return;
        if (!res.ok || res.profile) {
          setNeeded(false);
          return;
        }
        const guess = suggestUsername(user.primaryEmail || user.displayName || "");
        if (guess) {
          const claimed = await claimUsername({ data: { username: guess, display: user.displayName || guess } });
          if (cancelled || mine !== ticket.current) return;
          if (claimed.ok) {
            setNeeded(false);
            return;
          }
          const alt = `${guess.slice(0, 14)}${String(Date.now()).slice(-2)}`;
          const second = await claimUsername({ data: { username: alt, display: user.displayName || alt } });
          if (cancelled || mine !== ticket.current) return;
          if (second.ok) {
            setNeeded(false);
            return;
          }
        }
        setNeeded(true);
      } catch {
        /* session still settling */
      }
    };
    void check();
    const retry = window.setTimeout(() => void check(), 900);
    return () => {
      cancelled = true;
      window.clearTimeout(retry);
    };
  }, [isPending, user?.id, user?.isDevFallback, user?.primaryEmail, user?.displayName]);

  if (!needed) return null;

  const save = async () => {
    setPending(true);
    setError("");
    const res = await claimUsername({ data: { username, display: user?.displayName || username } });
    setPending(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    ticket.current += 1;
    setNeeded(false);
  };

  return (
    <div className="gate-stage">
      <form
        className="glass-strong w-full max-w-md rounded-2xl p-6"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <p className="font-ui text-xs font-semibold tracking-[0.12em] text-cine-cyan">USERNAME</p>
        <h2 className="mt-2 font-ui text-2xl font-semibold leading-tight tracking-tight">Claim your CINEVO name.</h2>
        <p className="mt-2 text-sm text-cine-muted">
          Friends share Plex and Jellyfin catalogs with this handle. Playback stays on the original server.
        </p>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. james"
          autoComplete="username"
          aria-label="Username"
          required
          minLength={3}
          maxLength={20}
          pattern="[A-Za-z][A-Za-z0-9_]{2,19}"
          className="mt-5 h-12 w-full rounded-xl border border-cine-border bg-cine-well px-4 font-ui"
        />
        {error ? <p className="mt-2 text-sm text-cine-danger">{error}</p> : null}
        <button type="submit" disabled={pending} className="house-btn house-btn--play mt-5 w-full">
          {pending ? "Saving…" : "Save username"}
        </button>
        <button
          type="button"
          className="mt-3 w-full text-center font-ui text-sm text-cine-faint"
          onClick={() => {
            window.sessionStorage.setItem("cinevo-username-later", "1");
            ticket.current += 1;
            setNeeded(false);
          }}
        >
          Remind me later
        </button>
      </form>
    </div>
  );
}

export { SignedIn, SignedOut };
