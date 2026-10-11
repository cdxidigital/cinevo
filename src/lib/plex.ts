import { factsFromPlex, safeArtPath } from "./artwork-model.ts";

export type PlexConnection = {
  uri: string;
  local: boolean;
  relay: boolean;
  protocol: string;
  address: string;
  port: number;
};

export type PlexServer = {
  id: string;
  name: string;
  owned: boolean;
  productVersion: string;
  platform: string;
  accessToken: string;
  publicAddress: string;
  presence: boolean;
  connections: PlexConnection[];
};

export type PlexSection = {
  key: string;
  title: string;
  type?: string;
  count?: number;
};

export function plexClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    try {
      const key = "cinevo-plex-client";
      if (typeof localStorage !== "undefined") {
        const existing = localStorage.getItem(key);
        if (existing) return existing;
        const id = `cinevo-${crypto.randomUUID()}`;
        localStorage.setItem(key, id);
        return id;
      }
    } catch {
      /* private mode */
    }
    return `cinevo-${crypto.randomUUID()}`;
  }
  return "cinevo-web";
}

export function plexAuthUrl(clientId: string, code: string, forwardUrl?: string) {
  const params = new URLSearchParams({
    clientID: clientId,
    code,
    "context[device][product]": "CINEVO",
    "context[device][version]": "1.0.0",
    "context[device][platform]": "Web",
    "context[device][device]": "Web",
    "context[device][deviceName]": "CINEVO",
  });
  if (forwardUrl) params.set("forwardUrl", forwardUrl);
  // Hashbang, not `auth#?`. Plex's app only reads the pin from `auth/#!?`.
  return `https://app.plex.tv/auth/#!?${params.toString()}`;
}

export function isPlexServer(resource: { provides?: unknown; product?: unknown }) {
  const provides = String(resource.provides || "")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return provides.includes("server") || String(resource.product || "").toLowerCase().includes("plex media server");
}

export function parsePlexConnections(raw: unknown): PlexConnection[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      const row = c as Record<string, unknown>;
      const uri = String(row.uri || "").replace(/\/$/, "");
      if (!uri) return null;
      return {
        uri,
        local: Boolean(row.local),
        relay: Boolean(row.relay),
        protocol: String(row.protocol || (uri.startsWith("https") ? "https" : "http")),
        address: String(row.address || ""),
        port: Number(row.port || 32400),
      } satisfies PlexConnection;
    })
    .filter((c): c is PlexConnection => Boolean(c));
}

export function rankConnections(conns: PlexConnection[]) {
  return [...conns].sort((a, b) => connectionScore(b) - connectionScore(a));
}

export function connectionScore(c: PlexConnection) {
  let score = 0;
  if (c.local && !c.relay) score += 50;
  else if (!c.relay) score += 25;
  else score += 5;
  if (c.protocol === "https") score += 10;
  if (c.protocol === "http" && c.local) score += 6;
  return score;
}

export function connectionKind(c: Pick<PlexConnection, "local" | "relay">) {
  if (c.relay) return "Relay";
  if (c.local) return "Local";
  return "Remote";
}

export function parsePlexResources(raw: unknown): PlexServer[] {
  const wrapped = raw as { resources?: unknown };
  const list = Array.isArray(raw) ? raw : Array.isArray(wrapped?.resources) ? wrapped.resources : [];
  const servers: PlexServer[] = [];
  for (const item of list) {
    const row = item as Record<string, unknown>;
    if (!isPlexServer(row)) continue;
    const id = String(row.clientIdentifier || row.machineIdentifier || "");
    if (!id) continue;
    servers.push({
      id,
      name: String(row.name || "Plex server"),
      owned: Boolean(row.owned),
      productVersion: String(row.productVersion || ""),
      platform: String(row.platform || ""),
      accessToken: String(row.accessToken || ""),
      publicAddress: String(row.publicAddress || ""),
      presence: row.presence !== false,
      connections: parsePlexConnections(row.connections),
    });
  }
  return servers.sort((a, b) => Number(b.owned) - Number(a.owned) || a.name.localeCompare(b.name));
}

export function parsePlexSections(raw: unknown): PlexSection[] {
  const container = (raw as { MediaContainer?: { Directory?: unknown[] } })?.MediaContainer;
  const dirs = container?.Directory || [];
  return dirs.map((item) => {
    const d = item as Record<string, unknown>;
    return {
      key: String(d.key ?? d.uuid ?? ""),
      title: String(d.title || "Library"),
      type: String(d.type || ""),
      count: Number(d.size || d.count || 0) || undefined,
    };
  }).filter((s) => s.key);
}

export function plexFilePath(meta: Record<string, unknown>) {
  const media = Array.isArray(meta.Media) ? meta.Media : [];
  for (const item of media) {
    const parts = Array.isArray((item as { Part?: unknown[] }).Part) ? (item as { Part: unknown[] }).Part : [];
    for (const part of parts) {
      const file = String((part as { file?: string }).file || "");
      if (file) return file;
    }
  }
  return "";
}

function folderFromFile(file: string) {
  const parts = file.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

export function parsePlexFolderPage(raw: unknown) {
  const container = (raw as { MediaContainer?: { Metadata?: unknown[]; Directory?: unknown[] } })?.MediaContainer;
  const rows = container?.Metadata || container?.Directory || [];
  return rows.map((item) => {
    const row = item as Record<string, unknown>;
    const file = plexFilePath(row) || String(row.file || "");
    const key = String(row.key || "");
    const name = String(row.title || row.name || "");
    const directory = !file && (row.type === "directory" || key.includes("folder") || key.includes("parent="));
    return { name, key, file, directory };
  });
}

export function parsePlexMetadata(raw: unknown, sourceLabel: string) {
  const container = (raw as { MediaContainer?: { Metadata?: unknown[] } })?.MediaContainer;
  const meta = container?.Metadata || [];
  return meta.map((item) => {
    const m = item as Record<string, unknown>;
    const facts = factsFromPlex(m, String(m.ratingKey || ""));
    const genreTag = facts.genre || "Plex";
    const type = String(m.type || "");
    let title = String(m.title || "Untitled");
    if (type === "episode") {
      const show = String(m.grandparentTitle || "");
      const season = Number(m.parentIndex || 0);
      const episode = Number(m.index || 0);
      const code = season || episode ? `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}` : "";
      title = [show, code, title].filter(Boolean).join(" · ");
    }
    const file = plexFilePath(m);
    return {
      id: `plex-${m.ratingKey || m.guid || m.title}`,
      ratingKey: String(m.ratingKey || ""),
      title,
      year: String(m.year || facts.year || ""),
      kind: type === "episode" || type === "show" ? ("series" as const) : ("movie" as const),
      synopsis: facts.synopsis || String(m.summary || ""),
      genre: genreTag,
      genres: facts.genres.length ? facts.genres : [genreTag],
      runtime: facts.runtime,
      rating: facts.rating,
      cast: facts.cast,
      director: facts.director,
      studio: facts.studio,
      contentRating: facts.contentRating,
      writers: facts.writers,
      posterPath: facts.posterPath,
      stillPath: facts.stillPath,
      showPosterPath: type === "episode" ? safeArtPath(String(m.grandparentThumb || "")) || "" : "",
      sourceLabel,
      folder: file ? folderFromFile(file) : "",
    };
  });
}
