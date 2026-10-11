/** Shared metadata and artwork paths. No network, no tokens. */

export function formatRuntime(ms: number) {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  const mins = Math.round(ms / 60000);
  if (mins <= 0) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function normalizeRating(value: unknown) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const scaled = n <= 1 ? n * 10 : n > 10 && n <= 100 ? n / 10 : n;
  return Math.round(Math.min(10, scaled) * 10) / 10;
}

export function artProxyUrl(ticket: string, path: string) {
  return `/api/art/${ticket}?path=${encodeURIComponent(path)}`;
}

/** Relative image path on the user's own server. Rejects off-host URLs. */
export function safeArtPath(input: string) {
  const cut = input.split("#")[0] || "";
  const [pathname, query] = cut.split("?");
  if (!pathname || pathname.includes("..") || pathname.includes("\\") || pathname.includes("://")) return null;
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (path.length > 400) return null;
  if (!/^\/(library\/|photo\/|Items\/)/.test(path)) return null;
  if (query && !/^[\w&=%.\-]+$/.test(query)) return null;
  return query ? `${path}?${query}` : path;
}

function tags(list: unknown) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => String((item as { tag?: string }).tag || ""))
    .map((item) => item.trim())
    .filter(Boolean);
}

export type MediaFacts = {
  synopsis: string;
  year: string;
  runtime: string;
  rating: number;
  genre: string;
  genres: string[];
  cast: string[];
  director: string;
  studio: string;
  contentRating: string;
  writers: string[];
  posterPath: string;
  stillPath: string;
  showPosterPath: string;
};

export function factsFromPlex(raw: Record<string, unknown>, ratingKey: string): MediaFacts {
  const genres = tags(raw.Genre);
  const key = ratingKey.replace(/^plex-/, "");
  const thumb = safeArtPath(String(raw.thumb || "")) || (key ? safeArtPath(`/library/metadata/${key}/thumb`) : null);
  const art = safeArtPath(String(raw.art || "")) || (key ? safeArtPath(`/library/metadata/${key}/art`) : null);
  return {
    synopsis: String(raw.summary || "").trim(),
    year: raw.year ? String(raw.year) : "",
    runtime: formatRuntime(Number(raw.duration) || 0),
    rating: normalizeRating(raw.rating ?? raw.audienceRating),
    genre: genres[0] || "",
    genres,
    cast: tags(raw.Role).slice(0, 8),
    director: tags(raw.Director)[0] || "",
    studio: tags(raw.Studio)[0] || "",
    contentRating: String(raw.contentRating || "").trim(),
    writers: tags(raw.Writer).slice(0, 6),
    posterPath: thumb || "",
    stillPath: art || thumb || "",
    showPosterPath: safeArtPath(String(raw.grandparentThumb || "")) || "",
  };
}

type JellyfinPerson = { Name?: string; Type?: string };

export function factsFromJellyfin(item: {
  Id?: string;
  Overview?: string;
  ProductionYear?: number;
  PremiereDate?: string;
  RunTimeTicks?: number;
  CommunityRating?: number;
  Genres?: string[];
  People?: JellyfinPerson[];
  Studios?: Array<string | { Name?: string }>;
  OfficialRating?: string;
  SeriesId?: string;
  SeriesPrimaryImageTag?: string;
  ImageTags?: { Primary?: string };
  BackdropImageTags?: string[];
}): MediaFacts {
  const id = String(item.Id || "");
  const genres = (item.Genres || []).map((genre) => genre.trim()).filter(Boolean);
  const people = item.People || [];
  const cast = people
    .filter((person) => /actor/i.test(person.Type || ""))
    .map((person) => String(person.Name || "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const director = people.find((person) => /director/i.test(person.Type || ""));
  const writers = people
    .filter((person) => /writer/i.test(person.Type || ""))
    .map((person) => String(person.Name || "").trim())
    .filter(Boolean)
    .slice(0, 6);
  const studio = (item.Studios || [])
    .map((entry) => (typeof entry === "string" ? entry : entry.Name || ""))
    .map((entry) => entry.trim())
    .find(Boolean);
  const seriesPoster =
    item.SeriesId && item.SeriesPrimaryImageTag
      ? safeArtPath(`/Items/${item.SeriesId}/Images/Primary?maxWidth=480&quality=80`)
      : null;
  const poster = id ? safeArtPath(`/Items/${id}/Images/Primary?maxWidth=480&quality=80`) : null;
  const still = id
    ? item.BackdropImageTags?.length
      ? safeArtPath(`/Items/${id}/Images/Backdrop/0?maxWidth=1280&quality=70`)
      : poster
    : null;
  const year = item.ProductionYear ? String(item.ProductionYear) : String(item.PremiereDate || "").slice(0, 4);
  return {
    synopsis: String(item.Overview || "").trim(),
    year: /^\d{4}$/.test(year) ? year : "",
    runtime: formatRuntime((Number(item.RunTimeTicks) || 0) / 10000),
    rating: normalizeRating(item.CommunityRating),
    genre: genres[0] || "",
    genres,
    cast,
    director: String(director?.Name || "").trim(),
    studio: studio || "",
    contentRating: String(item.OfficialRating || "").trim(),
    writers,
    posterPath: item.ImageTags?.Primary ? poster || "" : "",
    stillPath: still || "",
    showPosterPath: seriesPoster || "",
  };
}
