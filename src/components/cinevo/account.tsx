import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { claimUsername, getMyProfile, suggestUsername } from "@/lib/sharing";
import { cn } from "@/lib/utils";

export function AuthSlot({ className }: { className?: string }) {
  const { user, isPending } = useCurrentUserState();
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
  return (
    <div className={cn("cinevo-account", className)}>
      <UserButton />
    </div>
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
  }, [isPending, user]);

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
    <div className="gate-stage fixed inset-0 z-[70] bg-cine-bg/80 p-4">
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
