import { create } from "zustand";
import { persist } from "zustand/middleware";
import { byMood, type Mood, type Title } from "./catalog";
import type { LibSource, LibraryTitle, ThemeId } from "./library";
import { EMPTY_HOUSE, rememberVisit, type HouseRecord } from "./house-card";
import { mixMode, clampEq, type MixMode } from "./house-mix";
import { makePoster, migrateTheme } from "./library";
import type { Collection, Marker, PlayLog, TitlePatch } from "./house-tools";
import type { PlexServer } from "./plex";
import {
  DEFAULT_DASHBOARD_WIDGETS,
  sanitizeDashboardWidgets,
  type DashboardWidgetId,
} from "./dashboard";

export type Room = "stage" | "browse" | "movies" | "shows" | "sidebar" | "tools";

export type LibraryView = "grid" | "list" | "hybrid";
export type LibrarySort = "title" | "year" | "added" | "rating" | "runtime";

export type Preferences = {
  nightMode: boolean;
  zenMode: boolean;
  focusMode: boolean;
  audioHints: boolean;
  theme: ThemeId;
  dashboardWidgets: DashboardWidgetId[];
  introSkip: number;
  subtitleOffset: number;
  libraryView: LibraryView;
  librarySort: LibrarySort;
  mix: MixMode;
  ambience: boolean;
  denoise: boolean;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
};

export type SourceFilter = "all" | "folder" | "plex" | "jellyfin" | "shared";

export type Invite = {
  id: string;
  token: string;
  name: string;
  days: number;
  status: "active" | "paused" | "revoked";
  createdAt: number;
  expiresAt: number;
  libraries: string[];
};

export type NoticeCategory = "library" | "sharing" | "privacy" | "account";

export type Notice = {
  id: string;
  category: NoticeCategory;
  title: string;
  message: string;
  createdAt: number;
  readAt: number | null;
  href?: string;
};

export type Note = {
  id: string;
  titleId: string;
  body: string;
  createdAt: number;
};

export type Party = { titleId: string; with: string } | null;

type Library = { id: string; name: string; kind: string; selected: boolean };

export type CoreTab = "libraries" | "sharing" | "stewardship" | "ai" | "operations";

type CinevoState = {
  room: Room;
  selectedId: string | null;
  playingId: string | null;
  playing: boolean;
  progress: Record<string, number>;
  favorites: string[];
  tonight: string[];
  notes: Note[];
  party: Party;
  mood: Mood;
  searchOpen: boolean;
  libraryQuery: string;
  settingsOpen: boolean;
  coreOpen: boolean;
  coreTab: CoreTab;
  noticesOpen: boolean;
  hydrated: boolean;
  toast: string;
  prefs: Preferences;
  libraries: Library[];
  invites: Invite[];
  notices: Notice[];
  aiConsent: boolean;
  nodeUrl: string;
  nodeToken: string;
  nodeDevice: string;
  plexClientId: string;
  plexToken: string;
  plexUser: string;
  plexServers: PlexServer[];
  libraryOwner: string;
  sources: LibSource[];
  localTitles: LibraryTitle[];
  remoteTitles: LibraryTitle[];
  sourceFilter: SourceFilter;
  activeSourceId: string;
  collections: Collection[];
  markers: Marker[];
  plays: PlayLog[];
  patches: Record<string, TitlePatch>;
  house: HouseRecord;
  setRoom: (room: Room) => void;
  openTitle: (id: string) => void;
  closeTitle: () => void;
  play: (id: string) => void;
  stopPlay: () => void;
  togglePlay: () => void;
  setProgress: (id: string, value: number) => void;
  toggleFavorite: (id: string) => void;
  addTonight: (id: string) => void;
  removeTonight: (id: string) => void;
  addNote: (titleId: string, body: string) => void;
  removeNote: (id: string) => void;
  startParty: (titleId: string, withName: string) => void;
  endParty: () => void;
  setMood: (mood: Mood) => void;
  shufflePlay: () => void;
  setSearchOpen: (open: boolean) => void;
  setLibraryQuery: (query: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setCoreOpen: (open: boolean, tab?: CoreTab) => void;
  setCoreTab: (tab: CoreTab) => void;
  setNoticesOpen: (open: boolean) => void;
  flash: (msg: string) => void;
  notify: (input: Omit<Notice, "id" | "createdAt" | "readAt">) => void;
  markNoticeRead: (id: string) => void;
  markAllNoticesRead: () => void;
  dismissNotice: (id: string) => void;
  clearNotices: () => void;
  patchPrefs: (p: Partial<Preferences>) => void;
  setTheme: (theme: ThemeId) => void;
  setDashboardWidgets: (widgets: DashboardWidgetId[]) => void;
  toggleLibrary: (id: string) => void;
  addInvite: (name: string, days: number) => Invite;
  setInviteStatus: (id: string, status: Invite["status"]) => void;
  setAiConsent: (on: boolean) => void;
  setNodeUrl: (url: string) => void;
  setNodeSession: (token: string, deviceId: string) => void;
  clearNodeSession: () => void;
  setPlexSession: (token: string, username: string, servers: PlexServer[], clientId: string) => void;
  setPlexServers: (servers: PlexServer[]) => void;
  clearPlexSession: () => void;
  addFolderTitles: (titles: LibraryTitle[], source: LibSource) => void;
  addRemoteTitles: (titles: LibraryTitle[], source: LibSource) => void;
  removeSource: (id: string) => void;
  setSourceFilter: (filter: SourceFilter) => void;
  setActiveSource: (id: string) => void;
  createCollection: (name: string) => void;
  addToCollection: (collectionId: string, titleId: string) => void;
  removeFromCollection: (collectionId: string, titleId: string) => void;
  deleteCollection: (collectionId: string) => void;
  patchTitle: (id: string, patch: TitlePatch) => void;
  hideTitle: (id: string) => void;
  patchArtwork: (
    items: {
      id: string;
      poster?: string;
      still?: string;
      synopsis?: string;
      year?: string;
      runtime?: string;
      rating?: number;
      genre?: string;
      genres?: string[];
      cast?: string[];
      director?: string;
      studio?: string;
      contentRating?: string;
      writers?: string[];
      showPoster?: string;
    }[],
  ) => void;
  addMarker: (titleId: string, at: number, label: string) => void;
  removeMarker: (id: string) => void;
  clearLocalData: () => void;
  noteVisit: () => void;
  finishOnboarding: () => void;
};

export const DEFAULT_LIBRARIES: Library[] = [];

const DEFAULT_PREFS: Preferences = {
  nightMode: true,
  zenMode: false,
  focusMode: false,
  audioHints: true,
  theme: "harbor",
  dashboardWidgets: [...DEFAULT_DASHBOARD_WIDGETS],
  introSkip: 0,
  subtitleOffset: 0,
  libraryView: "grid",
  librarySort: "title",
  mix: "premiere",
  ambience: true,
  denoise: true,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
};

const FRESH: Pick<
  CinevoState,
  | "progress"
  | "favorites"
  | "invites"
  | "notices"
  | "selectedId"
  | "playingId"
  | "playing"
  | "tonight"
  | "notes"
  | "party"
  | "mood"
  | "sources"
  | "localTitles"
  | "remoteTitles"
  | "sourceFilter"
  | "plexToken"
  | "plexUser"
  | "plexServers"
> = {
  progress: {},
  favorites: [],
  invites: [],
  notices: [],
  selectedId: null,
  playingId: null,
  playing: false,
  tonight: [],
  notes: [],
  party: null,
  mood: "all",
  sources: [],
  localTitles: [],
  remoteTitles: [],
  sourceFilter: "all",
  plexToken: "",
  plexUser: "",
  plexServers: [],
};

function catalogPool(get: () => CinevoState): Title[] {
  return [...get().localTitles, ...get().remoteTitles];
}

function inviteToken() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 22);
  }
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function hydrateInvites(raw: unknown): Invite[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = item as Partial<Invite>;
    const createdAt = Number(row.createdAt) || Date.now();
    const days = Number(row.days) || 7;
    return {
      id: String(row.id || `inv-${createdAt}`),
      token: String(row.token || inviteToken()),
      name: String(row.name || "Friend"),
      days,
      status: row.status === "paused" || row.status === "revoked" ? row.status : "active",
      createdAt,
      expiresAt: Number(row.expiresAt) || createdAt + days * 86_400_000,
      libraries: Array.isArray(row.libraries) ? row.libraries.map(String) : [],
    };
  });
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

let localSnap: LibraryTitle[] | undefined;
let localSlim: LibraryTitle[] | undefined;
let remoteSnap: LibraryTitle[] | undefined;
let remoteSlim: LibraryTitle[] | undefined;

function slimLocal(titles: LibraryTitle[]) {
  if (titles === localSnap && localSlim) return localSlim;
  localSnap = titles;
  localSlim = titles.map((t) => ({
    ...t,
    poster: t.poster?.startsWith("data:") ? "" : t.poster,
    still: t.still?.startsWith("data:") ? "" : t.still,
    showPoster: t.showPoster?.startsWith("data:") ? "" : t.showPoster,
  }));
  return localSlim;
}

function slimRemote(titles: LibraryTitle[]) {
  if (titles === remoteSnap && remoteSlim) return remoteSlim;
  remoteSnap = titles;
  remoteSlim = titles.map((t) => ({
    ...t,
    poster: t.poster?.startsWith("data:") ? "" : t.poster,
    still: t.still?.startsWith("data:") ? "" : t.still,
    showPoster: t.showPoster?.startsWith("data:") ? "" : t.showPoster,
  }));
  return remoteSlim;
}

/** Changes only when a title starts, passes 90%, or finishes. Playback ticks stay off this. */
export function progressBands(progress: Record<string, number>) {
  const parts: string[] = [];
  for (const id in progress) {
    const value = progress[id] ?? 0;
    if (value <= 0) continue;
    parts.push(`${id}:${value >= 100 ? "d" : value >= 90 ? "f" : "w"}`);
  }
  parts.sort();
  return parts.join("|");
}
function houseStorage() {
  let timer = 0;
  let pending: { name: string; value: unknown } | null = null;
  const write = () => {
    if (!pending || typeof localStorage === "undefined") return;
    const item = pending;
    pending = null;
    try {
      localStorage.setItem(item.name, JSON.stringify(item.value));
    } catch {
      /* private mode or a full disk */
    }
  };
  const flush = () => {
    if (typeof window !== "undefined") window.clearTimeout(timer);
    timer = 0;
    write();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }
  return {
    getItem: (name: string) => {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as { state: unknown; version?: number };
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: unknown) => {
      if (typeof window === "undefined") return;
      pending = { name, value };
      window.clearTimeout(timer);
      timer = window.setTimeout(flush, 1000);
    },
    removeItem: (name: string) => {
      pending = null;
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(name);
    },
  };
}

export const useCinevo = create<CinevoState>()(
  persist(
    (set, get) => ({
      room: "stage",
      searchOpen: false,
      libraryQuery: "",
      settingsOpen: false,
      coreOpen: false,
      coreTab: "libraries",
      noticesOpen: false,
      hydrated: false,
      toast: "",
      prefs: DEFAULT_PREFS,
      libraries: [],
      aiConsent: false,
      nodeUrl: "http://127.0.0.1:48184",
      nodeToken: "",
      nodeDevice: "",
      plexClientId: "",
      ...FRESH,
      libraryOwner: "",
      activeSourceId: "all",
      collections: [],
      markers: [],
      plays: [],
      patches: {},
      house: EMPTY_HOUSE,
      setRoom: (room) => set({ room, selectedId: null }),
      openTitle: (id) =>
        set({ selectedId: id, searchOpen: false, settingsOpen: false, coreOpen: false, noticesOpen: false }),
      closeTitle: () => set({ selectedId: null }),
      play: (id) => {
        const p = get().progress[id] ?? 0;
        set({
          playingId: id,
          playing: true,
          selectedId: null,
          progress: p >= 100 ? { ...get().progress, [id]: 0 } : get().progress,
          plays: [{ id: `play-${Date.now()}`, titleId: id, at: Date.now() }, ...get().plays].slice(0, 200),
        });
      },
      stopPlay: () => set({ playingId: null, playing: false }),
      togglePlay: () => {
        const id = get().playingId;
        if (id && (get().progress[id] ?? 0) >= 100) {
          get().play(id);
          return;
        }
        set({ playing: !get().playing });
      },
      setProgress: (id, value) => {
        const next = Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
        const prev = get().progress[id];
        if (prev === next) return;
        const live = get().playing && get().playingId === id && next > 0 && next < 100;
        if (live && prev != null && Math.abs(prev - next) < 0.35) return;
        set({ progress: { ...get().progress, [id]: next } });
      },
      toggleFavorite: (id) => {
        const has = get().favorites.includes(id);
        set({
          favorites: has ? get().favorites.filter((x) => x !== id) : [...get().favorites, id],
        });
        get().flash(has ? "Removed from My List" : "Saved to My List");
      },
      addTonight: (id) => {
        if (get().tonight.includes(id)) {
          get().flash("Already in tonight");
          return;
        }
        if (get().tonight.length >= 8) {
          get().flash("Tonight is full");
          return;
        }
        set({ tonight: [...get().tonight, id] });
        get().flash("Queued for tonight");
      },
      removeTonight: (id) => set({ tonight: get().tonight.filter((x) => x !== id) }),
      addNote: (titleId, body) => {
        const text = body.trim().slice(0, 280);
        if (!text) return;
        set({
          notes: [
            { id: `n-${Date.now()}`, titleId, body: text, createdAt: Date.now() },
            ...get().notes,
          ].slice(0, 40),
        });
        get().flash("Note saved");
      },
      removeNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) }),
      startParty: (titleId, withName) => {
        set({ party: { titleId, with: withName.trim() } });
        get().play(titleId);
        get().flash(withName.trim() ? `Watching with ${withName.trim()}` : "Private watch started");
      },
      endParty: () => set({ party: null }),
      setMood: (mood) => set({ mood }),
      shufflePlay: () => {
        const pool = byMood(get().mood, catalogPool(get));
        const fresh = pool.filter((t) => {
          const p = get().progress[t.id];
          return p == null || p >= 100;
        });
        const list = fresh.length ? fresh : pool;
        const pick = list[Math.floor(Math.random() * list.length)];
        if (pick) get().play(pick.id);
        else get().flash("Add a library first");
      },
      setSearchOpen: (searchOpen) =>
        set(
          searchOpen
            ? { searchOpen: true, settingsOpen: false, coreOpen: false, noticesOpen: false, selectedId: null }
            : { searchOpen: false },
        ),
      setLibraryQuery: (libraryQuery) => set({ libraryQuery }),
      setSettingsOpen: (settingsOpen) =>
        set(
          settingsOpen
            ? { settingsOpen: true, searchOpen: false, coreOpen: false, noticesOpen: false, selectedId: null }
            : { settingsOpen: false },
        ),
      setCoreOpen: (coreOpen, tab) =>
        set(
          coreOpen
            ? {
                coreOpen: true,
                coreTab: tab ?? get().coreTab,
                searchOpen: false,
                settingsOpen: false,
                noticesOpen: false,
                selectedId: null,
              }
            : { coreOpen: false, ...(tab ? { coreTab: tab } : {}) },
        ),
      setCoreTab: (coreTab) => set({ coreTab }),
      setNoticesOpen: (noticesOpen) =>
        set(
          noticesOpen
            ? { noticesOpen: true, searchOpen: false, settingsOpen: false, coreOpen: false, selectedId: null }
            : { noticesOpen: false },
        ),
      flash: (toast) => {
        set({ toast });
        window.setTimeout(() => {
          if (get().toast === toast) set({ toast: "" });
        }, 2200);
      },
      notify: (input) => {
        const notice: Notice = {
          id: `nt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          createdAt: Date.now(),
          readAt: null,
          ...input,
        };
        set({ notices: [notice, ...get().notices].slice(0, 40) });
      },
      markNoticeRead: (id) =>
        set({
          notices: get().notices.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: Date.now() } : n)),
        }),
      markAllNoticesRead: () =>
        set({
          notices: get().notices.map((n) => (n.readAt ? n : { ...n, readAt: Date.now() })),
        }),
      dismissNotice: (id) => set({ notices: get().notices.filter((n) => n.id !== id) }),
      clearNotices: () => set({ notices: [] }),
      patchPrefs: (p) => set({ prefs: { ...get().prefs, ...p } }),
      setTheme: (theme) => {
        set({ prefs: { ...get().prefs, theme } });
        if (typeof document !== "undefined") document.documentElement.setAttribute("data-theme", theme);
      },
      setDashboardWidgets: (dashboardWidgets) =>
        set({ prefs: { ...get().prefs, dashboardWidgets: sanitizeDashboardWidgets(dashboardWidgets) } }),
      toggleLibrary: (id) =>
        set({
          libraries: get().libraries.map((l) =>
            l.id === id ? { ...l, selected: !l.selected } : l,
          ),
          sources: get().sources.map((s) => (s.id === id ? { ...s, selected: !s.selected } : s)),
        }),
      addInvite: (name, days) => {
        const createdAt = Date.now();
        const invite: Invite = {
          id: `inv-${createdAt}`,
          token: inviteToken(),
          name: name.trim() || "Friend",
          days,
          status: "active",
          createdAt,
          expiresAt: createdAt + days * 86_400_000,
          libraries: get().sources.filter((s) => s.selected).map((s) => s.id),
        };
        set({ invites: [invite, ...get().invites] });
        get().notify({
          category: "sharing",
          title: "Private invitation created",
          message: `${invite.name} has ${days} days of access to selected libraries.`,
          href: "/app?core=sharing",
        });
        return invite;
      },
      setInviteStatus: (id, status) => {
        const current = get().invites.find((i) => i.id === id);
        set({
          invites: get().invites.map((i) => (i.id === id ? { ...i, status } : i)),
        });
        if (current) {
          get().notify({
            category: "sharing",
            title: status === "revoked" ? "Invitation revoked" : status === "paused" ? "Invitation paused" : "Invitation restored",
            message: `${current.name} is now ${status}.`,
            href: "/app?core=sharing",
          });
        }
      },
      setAiConsent: (aiConsent) => {
        set({ aiConsent });
        get().notify({
          category: "privacy",
          title: aiConsent ? "AI concierge enabled" : "AI concierge disabled",
          message: aiConsent
            ? "CINEVO may use selected library metadata when you ask."
            : "Metadata assistance is off until you opt in again.",
          href: "/app?core=ai",
        });
      },
      setNodeUrl: (nodeUrl) => set({ nodeUrl }),
      setNodeSession: (nodeToken, nodeDevice) => set({ nodeToken, nodeDevice }),
      clearNodeSession: () => set({ nodeToken: "", nodeDevice: "" }),
      setPlexSession: (plexToken, plexUser, plexServers, plexClientId) =>
        set({ plexToken, plexUser, plexServers, plexClientId }),
      setPlexServers: (plexServers) => set({ plexServers }),
      clearPlexSession: () => set({ plexToken: "", plexUser: "", plexServers: [] }),
      addFolderTitles: (titles, source) => {
        const existing = new Set(get().localTitles.map((t) => t.id));
        const next = titles.filter((t) => !existing.has(t.id));
        const sources = get().sources.filter((s) => s.id !== source.id);
        set({
          localTitles: [...next, ...get().localTitles].slice(0, 2000),
          sources: [{ ...source, count: next.length + (get().localTitles.filter((t) => t.sourceLabel === source.name).length) }, ...sources],
        });
        get().flash(next.length ? `Added ${next.length} titles from ${source.name}` : "No new video files in that folder");
        if (next.length) {
          get().notify({
            category: "library",
            title: "Folder indexed",
            message: `${next.length} titles from ${source.name} are now in CINEVO.`,
            href: "/app?core=libraries",
          });
        }
      },
      addRemoteTitles: (titles, source) => {
        const existing = new Set(get().remoteTitles.map((t) => t.id));
        const next = titles.filter((t) => !existing.has(t.id));
        const merged = [...next, ...get().remoteTitles].slice(0, 2000);
        const sources = get().sources.filter((s) => s.id !== source.id);
        const count = merged.filter((t) => t.source === source.kind && (t.sourceLabel === source.name || t.sourceLabel.startsWith(`${source.name.replace(/^@/, "")} ·`))).length || next.length;
        set({
          remoteTitles: merged,
          sources: [{ ...source, count: count || next.length }, ...sources],
        });
        get().flash(next.length ? `Imported ${next.length} titles from ${source.name}` : "No titles in that section");
        if (next.length) {
          const kindLabel =
            source.kind === "plex" ? "Plex" : source.kind === "jellyfin" ? "Jellyfin" : source.kind === "shared" ? "Shared" : "Library";
          get().notify({
            category: "library",
            title: `${kindLabel} library imported`,
            message: `${next.length} titles from ${source.name} are ready to browse.`,
            href: "/app?core=libraries",
          });
        }
      },
      removeSource: (id) => {
        const src = get().sources.find((s) => s.id === id);
        const matches = (label: string) => {
          if (!src) return false;
          if (label === src.name) return true;
          const handle = src.name.replace(/^@/, "");
          return label.startsWith(`${handle} ·`) || label.startsWith(`${src.name} ·`);
        };
        const droppedLocal = get().localTitles.filter((t) => src && t.source === src.kind && matches(t.sourceLabel));
        const localTitles = get().localTitles.filter((t) => !(src && t.source === src.kind && matches(t.sourceLabel)));
        const remoteTitles = get().remoteTitles.filter((t) => !(src && t.source === src.kind && matches(t.sourceLabel)));
        const keep = new Set([...localTitles, ...remoteTitles].map((t) => t.id));
        const sources = get().sources.filter((s) => s.id !== id);
        set({
          sources,
          localTitles,
          remoteTitles,
          sourceFilter: sources.length <= 1 ? "all" : get().sourceFilter,
          activeSourceId: get().activeSourceId === id ? "all" : get().activeSourceId,
          tonight: get().tonight.filter((tid) => keep.has(tid)),
          favorites: get().favorites.filter((tid) => keep.has(tid)),
        });
        void import("./library").then((m) => {
          for (const t of droppedLocal) m.forgetBlob(t.id);
        });
        void import("./folder-handles").then((m) => m.deleteFolderHandle(id));
        get().flash("Source removed");
      },
      setSourceFilter: (sourceFilter) => set({ sourceFilter }),
      setActiveSource: (activeSourceId) => set({ activeSourceId }),
      createCollection: (name) => {
        const label = name.trim().slice(0, 40);
        if (!label) return;
        set({
          collections: [...get().collections, { id: `col-${Date.now()}`, name: label, titleIds: [] }],
        });
        get().flash(`Collection "${label}" created`);
      },
      addToCollection: (collectionId, titleId) => {
        set({
          collections: get().collections.map((collection) =>
            collection.id === collectionId && !collection.titleIds.includes(titleId)
              ? { ...collection, titleIds: [...collection.titleIds, titleId] }
              : collection,
          ),
        });
      },
      removeFromCollection: (collectionId, titleId) => {
        set({
          collections: get().collections.map((collection) =>
            collection.id === collectionId
              ? { ...collection, titleIds: collection.titleIds.filter((id) => id !== titleId) }
              : collection,
          ),
        });
      },
      deleteCollection: (collectionId) => {
        set({ collections: get().collections.filter((collection) => collection.id !== collectionId) });
        get().flash("Collection deleted");
      },
      patchTitle: (id, patch) => {
        set({ patches: { ...get().patches, [id]: { ...get().patches[id], ...patch } } });
        get().flash("Details saved in this house");
      },
      hideTitle: (id) => {
        set({
          localTitles: get().localTitles.filter((title) => title.id !== id),
          remoteTitles: get().remoteTitles.filter((title) => title.id !== id),
          tonight: get().tonight.filter((titleId) => titleId !== id),
          favorites: get().favorites.filter((titleId) => titleId !== id),
          collections: get().collections.map((collection) => ({
            ...collection,
            titleIds: collection.titleIds.filter((titleId) => titleId !== id),
          })),
        });
        get().flash("Removed from this house. The file was not deleted.");
      },
      patchArtwork: (items) => {
        const apply = <T extends { id: string; path?: string }>(title: T): T => {
          const patch = items.find((item) => item.id === title.id || item.id === title.path);
          if (!patch) return title;
          return {
            ...title,
            poster: patch.poster || (title as { poster?: string }).poster,
            still: patch.still || (title as { still?: string }).still,
            synopsis: patch.synopsis || (title as { synopsis?: string }).synopsis,
            year: patch.year || (title as { year?: string }).year,
            runtime: patch.runtime || (title as { runtime?: string }).runtime,
            rating: typeof patch.rating === "number" && patch.rating > 0 ? patch.rating : (title as { rating?: number }).rating,
            genre: patch.genre || (title as { genre?: string }).genre,
            genres: patch.genres?.length ? patch.genres : (title as { genres?: string[] }).genres,
            cast: patch.cast?.length ? patch.cast : (title as { cast?: string[] }).cast,
            director: patch.director || (title as { director?: string }).director,
            studio: patch.studio || (title as { studio?: string }).studio,
            contentRating: patch.contentRating || (title as { contentRating?: string }).contentRating,
            writers: patch.writers?.length ? patch.writers : (title as { writers?: string[] }).writers,
            showPoster: patch.showPoster || (title as { showPoster?: string }).showPoster,
          };
        };
        set({
          localTitles: get().localTitles.map(apply),
          remoteTitles: get().remoteTitles.map(apply),
        });
      },
      addMarker: (titleId, at, label) => {
        if (!Number.isFinite(at)) return;
        set({
          markers: [...get().markers, { id: `mk-${Date.now()}`, titleId, at, label: label.slice(0, 40) }].slice(-80),
        });
      },
      removeMarker: (id) => set({ markers: get().markers.filter((marker) => marker.id !== id) }),
      clearLocalData: () => {
        set({
          ...FRESH,
          libraries: [],
          searchOpen: false,
          coreOpen: false,
          noticesOpen: false,
          nodeToken: "",
          nodeDevice: "",
          aiConsent: false,
          plexClientId: "",
          libraryOwner: "",
          plexToken: "",
          plexUser: "",
          plexServers: [],
          activeSourceId: "all",
          collections: [],
          markers: [],
          plays: [],
          patches: {},
          house: EMPTY_HOUSE,
          prefs: { ...get().prefs, theme: get().prefs.theme, dashboardWidgets: [...DEFAULT_DASHBOARD_WIDGETS] },
        });
        try {
          localStorage.removeItem("cinevo-state");
          localStorage.removeItem("cinevo-storage");
          localStorage.removeItem("cinevo-local-v4");
        } catch {
          /* ignore quota / private mode */
        }
        void import("./library").then((m) => m.forgetAllBlobs());
        void import("./folder-handles").then((m) => m.clearFolderHandles());
        get().flash("Local data cleared");
      },
      noteVisit: () => {
        const today = new Date().toISOString().slice(0, 10);
        const visits = rememberVisit(get().house.visits, today);
        if (visits === get().house.visits) return;
        set({ house: { ...get().house, visits } });
      },
      finishOnboarding: () => set({ house: { ...get().house, onboarded: true } }),
    }),
    {
      name: "cinevo-local-v4",
      skipHydration: true,
      storage: houseStorage(),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CinevoState>;
        const theme = migrateTheme(p.prefs?.theme);
        return {
          ...current,
          ...p,
          tonight: Array.isArray(p.tonight) ? p.tonight : [],
          notes: Array.isArray(p.notes) ? p.notes : [],
          party: p.party ?? null,
          mood: p.mood ?? "all",
          nodeUrl: p.nodeUrl || "http://127.0.0.1:48184",
          nodeToken: p.nodeToken ?? "",
          nodeDevice: p.nodeDevice ?? "",
          plexClientId: p.plexClientId ?? "",
          plexToken: p.plexToken ?? "",
          plexUser: p.plexUser ?? "",
          plexServers: Array.isArray(p.plexServers) ? p.plexServers : [],
          libraryOwner: typeof p.libraryOwner === "string" ? p.libraryOwner : "",
          sources: Array.isArray(p.sources) ? p.sources : [],
          invites: hydrateInvites(p.invites),
          notices: Array.isArray(p.notices) ? p.notices : [],
          localTitles: Array.isArray(p.localTitles)
            ? p.localTitles.map((t) => ({
                ...t,
                cast: t.cast ?? [],
                genres: t.genres?.length ? t.genres : ["Home library"],
                poster:
                  t.poster && !t.poster.startsWith("data:")
                    ? t.poster
                    : makePoster(t.title, t.accent || "cyan"),
              }))
            : [],
          remoteTitles: Array.isArray(p.remoteTitles)
            ? p.remoteTitles.map((t) => ({
                ...t,
                cast: t.cast ?? [],
                genres: t.genres?.length ? t.genres : [t.genre || "Library"],
              }))
            : [],
          sourceFilter:
            Array.isArray(p.sources) && p.sources.length > 1 &&
            (p.sourceFilter === "folder" || p.sourceFilter === "plex" || p.sourceFilter === "jellyfin" || p.sourceFilter === "shared")
              ? p.sourceFilter
              : "all",
          activeSourceId: typeof p.activeSourceId === "string" ? p.activeSourceId : "all",
          collections: Array.isArray(p.collections) ? p.collections : [],
          markers: Array.isArray(p.markers) ? p.markers : [],
          plays: Array.isArray(p.plays) ? p.plays : [],
          patches: p.patches && typeof p.patches === "object" ? p.patches : {},
          house: {
            onboarded:
              p.house?.onboarded === true ||
              (Array.isArray(p.sources) && p.sources.length > 0) ||
              (Array.isArray(p.plays) && p.plays.length > 0),
            visits: Array.isArray(p.house?.visits) ? p.house.visits.filter((day) => typeof day === "string").slice(0, 21) : [],
          },
          room:
            p.room === "browse" || p.room === "movies" || p.room === "shows" || p.room === "sidebar" || p.room === "tools"
              ? p.room
              : "stage",
          prefs: {
            ...DEFAULT_PREFS,
            ...p.prefs,
            theme,
            dashboardWidgets: sanitizeDashboardWidgets(p.prefs?.dashboardWidgets),
            audioHints: p.prefs?.audioHints ?? true,
            introSkip: clampNumber(p.prefs?.introSkip, 0, 180, 0),
            subtitleOffset: clampNumber(p.prefs?.subtitleOffset, -15, 15, 0),
            libraryView: p.prefs?.libraryView === "list" || p.prefs?.libraryView === "hybrid" ? p.prefs.libraryView : "grid",
            librarySort: (["year", "added", "rating", "runtime"] as const).includes(p.prefs?.librarySort as "year")
              ? (p.prefs?.librarySort as LibrarySort)
              : "title",
            mix: mixMode(p.prefs?.mix),
            ambience: p.prefs?.ambience !== false,
            denoise: p.prefs?.denoise !== false,
            eqLow: clampEq(p.prefs?.eqLow),
            eqMid: clampEq(p.prefs?.eqMid),
            eqHigh: clampEq(p.prefs?.eqHigh),
          },
        };
      },
      partialize: (s) => ({
        progress: s.progress,
        favorites: s.favorites,
        prefs: s.prefs,
        libraries: s.libraries,
        invites: s.invites,
        notices: s.notices,
        aiConsent: s.aiConsent,
        tonight: s.tonight,
        notes: s.notes,
        party: s.party,
        mood: s.mood,
        nodeUrl: s.nodeUrl,
        nodeToken: s.nodeToken,
        nodeDevice: s.nodeDevice,
        plexClientId: s.plexClientId,
        plexToken: s.plexToken,
        plexUser: s.plexUser,
        plexServers: s.plexServers,
        libraryOwner: s.libraryOwner,
        sources: s.sources,
        localTitles: slimLocal(s.localTitles),
        remoteTitles: slimRemote(s.remoteTitles),
        sourceFilter: s.sourceFilter,
        activeSourceId: s.activeSourceId,
        collections: s.collections,
        markers: s.markers,
        plays: s.plays,
        patches: s.patches,
        house: s.house,
        room: s.room,
      }),
    },
  ),
);

export function titleById(id: string | null): Title | undefined {
  if (!id) return undefined;
  const s = useCinevo.getState();
  return s.localTitles.find((t) => t.id === id) ?? s.remoteTitles.find((t) => t.id === id);
}

export function libraryPool(): Title[] {
  const s = useCinevo.getState();
  return [...s.localTitles, ...s.remoteTitles];
}

export function inviteByToken(token: string | undefined) {
  if (!token) return undefined;
  return useCinevo.getState().invites.find((i) => i.token === token);
}
