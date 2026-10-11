import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { factsFromJellyfin } from "@/lib/artwork-model";

type JellyfinItem = {
  Id?: string;
  Name?: string;
  Type?: string;
  Path?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ProductionYear?: number;
  PremiereDate?: string;
  Overview?: string;
  Genres?: string[];
  CommunityRating?: number;
  CollectionType?: string;
  RunTimeTicks?: number;
  People?: { Name?: string; Type?: string }[];
  ImageTags?: { Primary?: string };
  BackdropImageTags?: string[];
};

function authHeader(deviceId: string, token?: string) {
  const parts = [
    `Client="CINEVO"`,
    `Device="Web"`,
    `DeviceId="${deviceId}"`,
    `Version="1.0.0"`,
  ];
  if (token) parts.push(`Token="${token}"`);
  return `MediaBrowser ${parts.join(", ")}`;
}

async function jfFetch(url: string, headers: Record<string, string>, init: RequestInit = {}, ms = 10000) {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(ms),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("Jellyfin could not verify those details.");
    throw new Error(String(data.message || data.error || `Jellyfin returned ${res.status}`));
  }
  return data;
}

function normalizeBase(url: string) {
  return url.trim().replace(/\/$/, "");
}

export const jellyfinConnect = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { baseUrl: string; username: string; password: string; clientId: string }) => input)
  .handler(async ({ data }) => {
    const baseUrl = normalizeBase(data.baseUrl);
    const deviceId = data.clientId.trim() || "cinevo-web";
    try {
      const body = await jfFetch(
        `${baseUrl}/Users/AuthenticateByName`,
        {
          "Content-Type": "application/json",
          "X-Emby-Authorization": authHeader(deviceId),
        },
        { method: "POST", body: JSON.stringify({ Username: data.username.trim(), Pw: data.password }) },
        12000,
      );
      const user = (body.User ?? {}) as { Id?: string; Name?: string };
      const token = String(body.AccessToken || "");
      if (!token || !user.Id) return { ok: false as const, error: "Jellyfin did not return a usable session." };
      return {
        ok: true as const,
        token,
        userId: String(user.Id),
        username: String(user.Name || data.username),
        baseUrl,
      };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Could not reach that Jellyfin library from here.",
      };
    }
  });

export const jellyfinListSections = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { baseUrl: string; token: string; userId: string; clientId: string }) => input)
  .handler(async ({ data }) => {
    const baseUrl = normalizeBase(data.baseUrl);
    try {
      const body = await jfFetch(
        `${baseUrl}/Users/${encodeURIComponent(data.userId)}/Views`,
        { "X-Emby-Authorization": authHeader(data.clientId, data.token) },
      );
      const items = (Array.isArray(body.Items) ? body.Items : []) as JellyfinItem[];
      const sections = items
        .filter((item) => {
          const kind = String(item.CollectionType || item.Type || "").toLowerCase();
          return kind.includes("movie") || kind.includes("tv") || kind.includes("series") || !kind;
        })
        .map((item) => ({
          key: String(item.Id || ""),
          title: String(item.Name || "Library"),
          type: String(item.CollectionType || item.Type || ""),
        }))
        .filter((s) => s.key);
      return { ok: true as const, sections };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Could not list Jellyfin libraries.",
      };
    }
  });

export const jellyfinImportSections = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      baseUrl: string;
      token: string;
      userId: string;
      clientId: string;
      sourceLabel: string;
      sectionKeys: string[];
    }) => input,
  )
  .handler(async ({ data }) => {
    const baseUrl = normalizeBase(data.baseUrl);
    const headers = { "X-Emby-Authorization": authHeader(data.clientId, data.token) };
    const titles: {
      id: string;
      title: string;
      year: string;
      kind: "movie" | "series";
      synopsis: string;
      genre: string;
      genres: string[];
      runtime: string;
      rating: number;
      cast: string[];
      director: string;
      studio: string;
      contentRating: string;
      writers: string[];
      sourceLabel: string;
      path: string;
      folder: string;
    }[] = [];
    const folders = new Set<string>();
    const folderOf = (file: string) => {
      const parts = file.replace(/\\/g, "/").split("/").filter(Boolean);
      parts.pop();
      return parts.join("/");
    };
    try {
      for (const key of data.sectionKeys.slice(0, 12)) {
        for (let start = 0; titles.length < 1600; start += 200) {
          const params = new URLSearchParams({
            ParentId: key,
            IncludeItemTypes: "Movie,Episode",
            Recursive: "true",
            Fields: "Overview,Genres,People,Path,ProductionYear,PremiereDate,CommunityRating,RunTimeTicks,ImageTags,BackdropImageTags,Studios,OfficialRating,SeriesId,SeriesPrimaryImageTag",
            Limit: "200",
            StartIndex: String(start),
            SortBy: "SortName",
            SortOrder: "Ascending",
          });
          const body = await jfFetch(
            `${baseUrl}/Users/${encodeURIComponent(data.userId)}/Items?${params}`,
            headers,
            {},
            12000,
          );
          const items = (Array.isArray(body.Items) ? body.Items : []) as JellyfinItem[];
          if (!items.length) break;
          for (const item of items) {
            const facts = factsFromJellyfin(item);
            const episode = String(item.Type || "") === "Episode";
            const season = Number(item.ParentIndexNumber || 0);
            const index = Number(item.IndexNumber || 0);
            const code = episode && (season || index) ? `S${String(season).padStart(2, "0")}E${String(index).padStart(2, "0")}` : "";
            const title = episode
              ? [item.SeriesName, code, item.Name].filter(Boolean).join(" · ")
              : String(item.Name || "Untitled");
            const folder = item.Path ? folderOf(item.Path) : "";
            if (folder) folders.add(folder);
            titles.push({
              id: `jellyfin-${item.Id || item.Name}`,
              title,
              year: facts.year || (item.ProductionYear ? String(item.ProductionYear) : ""),
              kind: episode ? "series" : "movie",
              synopsis: facts.synopsis,
              genre: facts.genre || "Jellyfin",
              genres: facts.genres,
              runtime: facts.runtime,
              rating: facts.rating,
              cast: facts.cast,
              director: facts.director,
              studio: facts.studio,
              contentRating: facts.contentRating,
              writers: facts.writers,
              sourceLabel: data.sourceLabel,
              path: String(item.Id || ""),
              folder,
            });
          }
          if (items.length < 200) break;
        }
      }
      const seen = new Set<string>();
      const unique = titles.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
      return { ok: true as const, titles: unique.slice(0, 1600), folders: [...folders].slice(0, 400) };
    } catch (err) {
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Could not import that Jellyfin library.",
      };
    }
  });
