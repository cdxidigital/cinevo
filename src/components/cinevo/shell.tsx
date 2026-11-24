import { Bell, Clapperboard, Home, Library, Menu, Play, Plus, Search, Server, Settings2, Share2, Sparkles, Tv, Wrench, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCinevo, progressBands, type Room } from "@/lib/cinevo-store";
import type { LibSource } from "@/lib/library";
import { isLoopbackUrl } from "@/lib/playback-urls";
import { cn } from "@/lib/utils";
import { useLibrary } from "@/lib/use-library";
import { coverFor } from "@/lib/library";
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

function ServerButton({ onClick }: { onClick: () => void }) {
  const sources = useCinevo((s) => s.sources);
  const nodeUrl = useCinevo((s) => s.nodeUrl);
  const nodeToken = useCinevo((s) => s.nodeToken);
  const mode = networkMode(sources, nodeUrl, nodeToken);
  const label = mode === "local" ? "On this device" : mode === "relay" ? "Remote server" : "Nothing connected";
  return (
    <button type="button" className="side-server" onClick={onClick}>
      <Server size={18} />
      <span>
        <b>Server</b>
        <small>
          <i className="net-dot" data-mode={mode} aria-hidden="true" /> {label}
        </small>
      </span>
    </button>
  );
}

function NowInProgress() {
  const library = useLibrary();
  const play = useCinevo((s) => s.play);
  const bands = useCinevo((s) => progressBands(s.progress));
  const rows = useMemo(() => {
    const progress = useCinevo.getState().progress;
    return library
      .filter((title) => {
        const seen = progress[title.id];
        return seen != null && seen > 0 && seen < 100;
      })
      .slice(0, 2);
  }, [bands, library]);
  return (
    <div className="top-now" aria-label="Now in progress">
      <span className="top-now__label">In progress</span>
      {rows.length ? (
        rows.map((title) => (
          <button key={title.id} type="button" onClick={() => play(title.id)} title={title.title}>
            <img src={coverFor(title.title, title.accent, title.poster)} alt="" />
            <b>{title.title}</b>
          </button>
        ))
      ) : (
        <small>Nothing mid-watch</small>
      )}
    </div>
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
  const coreOpen = useCinevo((s) => s.coreOpen);
  const unread = useCinevo((s) => s.notices.filter((n) => !n.readAt).length);
  const night = useCinevo((s) => s.prefs.nightMode);
  const zen = useCinevo((s) => s.prefs.zenMode);
  const playingId = useCinevo((s) => s.playingId);
  const party = useCinevo((s) => s.party);
  const endParty = useCinevo((s) => s.endParty);
  const [drawer, setDrawer] = useState(false);
  const [navHidden, setNavHidden] = useState(false);
  const hydrated = useCinevo((s) => s.hydrated);
  const noteVisit = useCinevo((s) => s.noteVisit);
  const gamification = useCinevo((s) => s.prefs.gamification);
  const previewHouse = useCinevo((s) => s.previewHouse);
  const leavePreview = useCinevo((s) => s.leavePreview);
  const nodeOffline = useCinevo((s) => s.nodeOffline);
  const nodeUrl = useCinevo((s) => s.nodeUrl);
  const nodeToken = useCinevo((s) => s.nodeToken);
  const setNodeOffline = useCinevo((s) => s.setNodeOffline);

  useEffect(() => {
    if (hydrated && gamification) noteVisit();
  }, [hydrated, noteVisit, gamification]);

  useEffect(() => {
    if (!nodeToken || !nodeUrl) {
      setNodeOffline(false);
      return;
    }
    let stop = false;
    const ping = () => {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 2500);
      void fetch(`${nodeUrl.replace(/\/$/, "")}/v1/status`, { signal: ctrl.signal })
        .then((res) => {
          if (!stop) setNodeOffline(!res.ok);
        })
        .catch(() => {
          if (!stop) setNodeOffline(true);
        })
        .finally(() => window.clearTimeout(timer));
    };
    ping();
    const id = window.setInterval(ping, 30000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [nodeUrl, nodeToken, setNodeOffline]);

  useEffect(() => {
    if (room === "browse" || NAV.some((item) => item.id === room)) return;
    setRoom("stage");
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

  useEffect(() => {
    setNavHidden(Boolean(playingId) && !drawer);
  }, [playingId, drawer]);

  const go = (id: Room) => {
    setRoom(id);
    setDrawer(false);
    const state = useCinevo.getState();
    if (state.coreOpen) setCoreOpen(false);
    if (state.searchOpen) setSearchOpen(false);
    if (state.settingsOpen) setSettingsOpen(false);
    if (state.noticesOpen) setNoticesOpen(false);
    if (state.selectedId) state.closeTitle();
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
        </nav>
        <div className="side-rail__foot">
          <p className="side-kicker">Quick</p>
          <button type="button" onClick={() => go("sidebar")}>
            <Plus size={18} />
            Add library
          </button>
          <button type="button" className={cn(coreOpen && coreTab === "ai" && "is-on")} onClick={() => setCoreOpen(true, "ai")}>
            <Sparkles size={18} />
            Ask
          </button>
          <button type="button" onClick={() => setCoreOpen(true, "sharing")}>
            <Share2 size={18} />
            Sharing
          </button>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
            Settings
          </button>
          <ServerButton onClick={() => go("sidebar")} />
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
        <NowInProgress />
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
              <NowInProgress />
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
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 font-ui text-sm font-medium text-cine-muted"
                onClick={() => go("sidebar")}
              >
                <Plus size={18} />
                Add library
              </button>
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 font-ui text-sm font-medium text-cine-muted"
                onClick={() => {
                  setCoreOpen(true, "sharing");
                  setDrawer(false);
                }}
              >
                <Share2 size={18} />
                Sharing
              </button>
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 font-ui text-sm font-medium text-cine-muted"
                onClick={() => go("sidebar")}
              >
                <Server size={18} />
                Server
              </button>
              <button
                type="button"
                className="flex h-11 w-full items-center gap-2 rounded-md px-3 font-ui text-sm font-medium text-cine-muted"
                onClick={() => {
                  setCoreOpen(true, "libraries");
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

      <main key={room} className={cn("house-main", room !== "stage" && "house-main--page")}>
        {previewHouse ? (
          <p className="house-banner" role="status">
            Preview — not your library
            <button type="button" onClick={() => leavePreview()}>
              Connect your real library
            </button>
          </p>
        ) : null}
        {nodeOffline && !previewHouse ? (
          <p className="house-banner house-banner--quiet" role="status">
            Offline / limited mode. Previously loaded titles stay here. Node is not answering.
          </p>
        ) : null}
        {children}
      </main>
      <ArtworkSync />
      <AccountLibraries />
      {overlays}
      <UsernameGate />
    </div>
  );
}
