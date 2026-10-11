export type Accent = "cyan" | "magenta" | "violet" | "amber";
export type Kind = "movie" | "series";

export type Title = {
  id: string;
  title: string;
  kind: Kind;
  year: string;
  runtime: string;
  genre: string;
  genres: string[];
  synopsis: string;
  cast: string[];
  director: string;
  rating: number;
  addedAt: string;
  poster: string;
  still: string;
  accent: Accent;
  live?: boolean;
  source?: "cinevo" | "folder" | "plex" | "jellyfin" | "shared";
  sourceLabel?: string;
  path?: string;
  folder?: string;
};

export const CATALOG: Title[] = [];

export function genresIn(pool: Title[]) {
  const names = pool
    .flatMap((t) => t.genres ?? [])
    .map((g) => (typeof g === "string" ? g.trim() : ""))
    .filter((g) => g.length > 0 && g !== "All");
  return ["All", ...Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))];
}

export const GENRES = ["All"];

export function getTitle(id: string) {
  return CATALOG.find((t) => t.id === id);
}

export function similarTo(title: Title, pool: Title[] = CATALOG) {
  const mine = title.genres ?? [];
  return pool
    .filter((t) => t.id !== title.id && (t.genres ?? []).some((g) => mine.includes(g)))
    .slice(0, 6);
}

export function filterCatalog(opts: {
  query?: string;
  kind?: Kind | "all";
  genre?: string;
  minRating?: number;
  pool?: Title[];
}) {
  const q = (opts.query ?? "").trim().toLowerCase();
  return (opts.pool ?? CATALOG).filter((t) => {
    const cast = t.cast ?? [];
    const genres = t.genres ?? [];
    const hay = `${t.title} ${t.synopsis} ${t.genre} ${cast.join(" ")} ${t.director}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (opts.kind && opts.kind !== "all" && t.kind !== opts.kind) return false;
    if (opts.genre && opts.genre !== "All" && !genres.includes(opts.genre)) return false;
    if (opts.minRating && t.rating < opts.minRating) return false;
    return true;
  });
}

export function recentlyAdded(n = 8, pool: Title[] = CATALOG) {
  return [...pool].sort((a, b) => b.addedAt.localeCompare(a.addedAt)).slice(0, n);
}

export type Mood = "all" | "neon" | "quiet" | "far" | "warm";

export const MOODS: { id: Mood; label: string; hint: string; genres: string[] }[] = [
  { id: "all", label: "All", hint: "Find your next scene.", genres: [] },
  { id: "neon", label: "Neon", hint: "Stay with the shadows.", genres: ["Action", "Noir", "Crime", "Cyberpunk", "Thriller"] },
  { id: "quiet", label: "Quiet", hint: "Settle into something human.", genres: ["Drama", "Romance", "Mystery"] },
  { id: "far", label: "Far", hint: "Leave the city for a while.", genres: ["Sci-Fi", "Adventure"] },
  { id: "warm", label: "Warm", hint: "Same tokens. Warmer grade.", genres: ["Nostalgia", "History", "Western", "Music"] },
];

export function byMood(mood: Mood, pool: Title[] = CATALOG) {
  if (mood === "all") return pool;
  const genres = MOODS.find((m) => m.id === mood)?.genres ?? [];
  const hits = pool.filter(
    (t) => (t.genres ?? []).some((g) => genres.includes(g)) || genres.includes(t.genre),
  );
  return hits.length ? hits : pool;
}

export function pickFeatured(opts: {
  mood: Mood;
  progress: Record<string, number>;
  tonight: string[];
  pool?: Title[];
}): Title | undefined {
  const all = opts.pool ?? CATALOG;
  if (!all.length) return undefined;
  const pool = byMood(opts.mood, all);
  for (const id of opts.tonight) {
    const hit = pool.find((t) => t.id === id) ?? all.find((t) => t.id === id);
    if (hit) return hit;
  }
  const cont = pool.find((t) => {
    const p = opts.progress[t.id];
    return p != null && p > 0 && p < 100;
  });
  if (cont) return cont;
  return [...pool].sort((a, b) => b.rating - a.rating)[0] ?? all[0];
}
