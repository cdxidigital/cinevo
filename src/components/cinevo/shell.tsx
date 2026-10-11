import { Bell, Clapperboard, Home, Library, Menu, Search, Settings2, Sparkles, Tv, Wrench, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { paramFromRoom } from "@/lib/app-destination";
import { useCinevo, type Room } from "@/lib/cinevo-store";
import type { LibSource } from "@/lib/library";
import { isLoopbackUrl } from "@/lib/playback-urls";
import { cn } from "@/lib/utils";
import { Onboarding } from "./onboarding";
import { Logo } from "./logo";
import { ArtworkSync } from "./artwork-sync";
import { AccountLibraries } from "./account-libraries";
import { AuthSlot, UsernameGate } from "./account";

const NAV: { id: Room; label: string; icon: typeof Home }[] = [
  { id: "stage", label: "Home", icon: Home },
  { id: "movies", label: "Movies", icon: Clapperboard },
  { id: "shows", label: "TV", icon: Tv },
  { id: "sidebar", label: "Library", icon: Library },
  { id: "tools", label: "Tools", icon: Wrench },
];

function networkMode(sources: LibSource[], nodeUrl: string, nodeToken: string): "local" | "relay" | "idle" {
  const relay = sources.some((s) => (s.kind === "plex" || s.kind === "jellyfin") && s.baseUrl && !isLoopbackUrl(s.baseUrl));
  if (relay) return "relay";
  const local =
    sources.some((s) => s.kind === "folder" || isLoopbackUrl(s.baseUrl)) || Boolean(nodeToken && isLoopbackUrl(nodeUrl));
  return local ? "local" : "idle";
}

function NetDot({ labeled = false }: { labeled?: boolean }) {
  const sources = useCinevo((s) => s.sources);
  const nodeUrl = useCinevo((s) => s.nodeUrl);
  const nodeToken = useCinevo((s) => s.nodeToken);
  const mode = networkMode(sources, nodeUrl, nodeToken);
  const label =
    mode === "local" ? "On this device" : mode === "relay" ? "Remote server" : "Nothing connected";
  if (!labeled) return <span className="net-dot" data-mode={mode} title={label} aria-label={label} />;
  return (
    <p className="side-status">
      <span className="net-dot" data-mode={mode} aria-hidden="true" />
      <span>{label}</span>
    </p>
  );
}

function LibrarySwitch() {
  const sources = useCinevo((s) => s.sources);
  const activeSourceId = useCinevo((s) => s.activeSourceId);
  const setActiveSource = useCinevo((s) => s.setActiveSource);
  const value = sources.some((source) => source.id === activeSourceId) ? activeSourceId : "all";
  return (
    <select
      className="library-switch"
      aria-label="Library"
      value={value}
      onChange={(e) => setActiveSource(e.target.value)}
    >
      <option value="all">{sources.length ? "All libraries" : "No library yet"}</option>
      {sources.map((source) => (
        <option key={source.id} value={source.id}>
          {source.name}
        </option>
      ))}
    </select>
  );
}

export function Shell({
  children,
  overlays,
}: {
  children: React.ReactNode;
  overlays?: React.ReactNode;
}) {
  const room = useCinevo((s) => s.room);
  const setRoom = useCinevo((s) => s.setRoom);
  const setSearchOpen = useCinevo((s) => s.setSearchOpen);
  const setSettingsOpen = useCinevo((s) => s.setSettingsOpen);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const coreTab = useCinevo((s) => s.coreTab);
  const setNoticesOpen = useCinevo((s) => s.setNoticesOpen);
  const unread = useCinevo((s) => s.notices.filter((n) => !n.readAt).length);
  const night = useCinevo((s) => s.prefs.nightMode);
  const zen = useCinevo((s) => s.prefs.zenMode);
  const searchOpen = useCinevo((s) => s.searchOpen);
  const settingsOpen = useCinevo((s) => s.settingsOpen);
  const coreOpen = useCinevo((s) => s.coreOpen);
  const noticesOpen = useCinevo((s) => s.noticesOpen);
  const selectedId = useCinevo((s) => s.selectedId);
  const playingId = useCinevo((s) => s.playingId);
  const party = useCinevo((s) => s.party);
  const endParty = useCinevo((s) => s.endParty);
  const navigate = useNavigate();
  const [drawer, setDrawer] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const hydrated = useCinevo((s) => s.hydrated);
  const noteVisit = useCinevo((s) => s.noteVisit);

  useEffect(() => {
    if (hydrated) noteVisit();
  }, [hydrated, noteVisit]);

  useEffect(() => {
    if (!NAV.some((item) => item.id === room)) setRoom("stage");
  }, [room, setRoom]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [drawer]);

  const overlayOpen = Boolean(searchOpen || settingsOpen || coreOpen || noticesOpen || selectedId);
  const playing = Boolean(playingId);
  useEffect(() => {
    if (!overlayOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [overlayOpen]);

  useEffect(() => {
    if (overlayOpen || drawer) {
      setNavHidden(false);
      return;
    }
    if (playing) {
      setNavHidden(true);
      return;
    }
    let t = window.setTimeout(() => setNavHidden(true), 2800);
    const poke = () => {
      setNavHidden(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setNavHidden(true), 2800);
    };
    window.addEventListener("mousemove", poke);
    window.addEventListener("keydown", poke);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousemove", poke);
      window.removeEventListener("keydown", poke);
    };
  }, [overlayOpen, drawer, playing]);

  const go = (id: Room) => {
    setRoom(id);
    setDrawer(false);
    if (useCinevo.getState().coreOpen) setCoreOpen(false);
    const room = paramFromRoom(id);
    void navigate({
      to: "/app",
      search: (prev) => {
        const next = { ...prev };
        if (room) next.room = room;
        else delete next.room;
        return next;
      },
      replace: true,
    });
  };

  return (
    <div className={cn("cinevo-house", night && "cinevo-night", zen && "cinevo-zen")}>
      <div className="house-still" />
      <div className="house-ambient" />
      <aside className="side-rail">
        <Link to="/" aria-label="CINEVO home" className="side-rail__brand">
          <Logo size="sm" tagline={false} />
        </Link>
        <nav className="side-rail__nav" aria-label="Main">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                className={cn(room === item.id && !(coreOpen && coreTab === "ai") && "is-on")}
                aria-current={room === item.id && !(coreOpen && coreTab === "ai") ? "page" : undefined}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
          <button
            type="button"
            className={cn(coreOpen && coreTab === "ai" && "is-on")}
            aria-current={coreOpen && coreTab === "ai" ? "page" : undefined}
            onClick={() => setCoreOpen(true, "ai")}
          >
            <Sparkles size={18} />
            Ask
          </button>
        </nav>
        <div className="side-rail__foot">
          <button type="button" onClick={() => setCoreOpen(true, coreTab === "ai" ? "libraries" : undefined)}>
            Core
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
            Settings
          </button>
          <NetDot labeled />
          <a className="rail-credit" href="https://www.fourtee2.digital" target="_blank" rel="noreferrer">
            CINEVO - a fourtee2digital project
          </a>
        </div>
      </aside>
      <header className={cn("top-nav", navHidden && "is-hidden")}>
        <Link to="/" aria-label="CINEVO home" className="top-nav__brand">
          <Logo size="sm" tagline={false} />
        </Link>
        <nav className="top-nav__links max-md:hidden" aria-label="Main">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              className={cn(room === item.id && "is-on")}
              aria-current={room === item.id ? "page" : undefined}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-nav__tools">
          <button
            type="button"
            className="top-nav__icon md:hidden"
            aria-label="Open menu"
            onClick={() => setDrawer(true)}
          >
            <Menu size={18} />
          </button>
          <LibrarySwitch />
          <button type="button" className="house-search" onClick={() => setSearchOpen(true)}>
            <Search size={16} />
            <span>Search this library</span>
          </button>
          {party ? (
            <button type="button" className="party-chip" onClick={endParty} title="Ends the note on this screen. Playback is not synced to another device.">
              With {party.with || "someone"} · End
            </button>
          ) : null}
          <Link to="/remote" className="top-nav__core max-md:hidden">
            Remote
          </Link>
          <button type="button" className="top-nav__core max-md:hidden" onClick={() => setCoreOpen(true, coreTab === "ai" ? "libraries" : undefined)}>
            Core
          </button>
          <button type="button" aria-label="Search" className="top-nav__icon md:hidden" onClick={() => setSearchOpen(true)}>
            <Search size={18} />
          </button>
          <button
            type="button"
            aria-label={unread ? `${unread} unread notices` : "Notices"}
            className="top-nav__icon relative"
            onClick={() => setNoticesOpen(true)}
          >
            <Bell size={18} />
            {unread ? (
              <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-cine-magenta" aria-hidden="true" />
            ) : null}
          </button>
          <button
            type="button"
            aria-label="Settings"
            className="top-nav__icon md:hidden"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 size={18} />
          </button>
          <span className="md:hidden">
            <NetDot />
          </span>
          <AuthSlot className="max-md:hidden" />
        </div>
      </header>

      {drawer ? (
        <div className="drawer-scrim md:hidden" onMouseDown={() => setDrawer(false)}>
          <aside className="drawer-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <Logo size="md" tagline={false} />
              <button type="button" aria-label="Close menu" className="top-nav__icon" onClick={() => setDrawer(false)}>
                <X size={18} />
              </button>
            </div>
            {party ? (
              <button
                type="button"
                className="party-chip mb-3"
                onClick={() => {
                  endParty();
                  setDrawer(false);
                }}
              >
                With {party.with || "someone"} · End
              </button>
            ) : null}
            <nav className="flex flex-col gap-1" aria-label="Main">
              <LibrarySwitch />
              {NAV.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    className={cn(
                      "flex h-11 w-full items-center gap-2 rounded-md px-3 font-ui text-sm font-medium",
                      room === item.id ? "bg-cine-surface text-cine-text" : "text-cine-muted",
                    )}
                    aria-current={room === item.id ? "page" : undefined}
                  >
                    <Icon size={18} />
                    {item.label}
                  </button>
                );
              })}
              <button
                type="button"
                className={cn(
                  "flex h-11 w-full items-center gap-2 rounded-md px-3 font-ui text-sm font-medium",
                  coreOpen && coreTab === "ai" ? "bg-cine-surface text-cine-text" : "text-cine-muted",
                )}
                onClick={() => {
                  setCoreOpen(true, "ai");
                  setDrawer(false);
                }}
              >
                <Sparkles size={18} />
                Ask
              </button>
              <button
                type="button"
                className="flex h-11 w-full items-center rounded-md px-3 font-ui text-sm font-medium text-cine-muted"
                onClick={() => {
                  setCoreOpen(true, coreTab === "ai" ? "libraries" : undefined);
                  setDrawer(false);
                }}
              >
                Core
              </button>
              <button
                type="button"
                className="flex h-11 w-full items-center rounded-md px-3 font-ui text-sm font-medium text-cine-muted"
                onClick={() => {
                  setNoticesOpen(true);
                  setDrawer(false);
                }}
              >
                Notices{unread ? ` (${unread})` : ""}
              </button>
              <Link
                to="/remote"
                className="flex h-11 w-full items-center rounded-md px-3 font-ui text-sm font-medium text-cine-muted"
                onClick={() => setDrawer(false)}
              >
                Remote and cast
              </Link>
            </nav>
            <div className="mt-6">
              <AuthSlot />
            </div>
          </aside>
        </div>
      ) : null}

      <main key={room} className={cn("house-main", room !== "stage" && "house-main--page")}>{children}</main>
      <ArtworkSync />
      <AccountLibraries />
      <Onboarding />
      {overlays}
      <UsernameGate />
    </div>
  );
}
