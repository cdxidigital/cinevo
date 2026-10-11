import type { Title } from "./catalog";

function identityOf(rel: string) {
  const normalized = rel.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const file = parts.pop() || normalized;
  const coded = /s(\d{1,2})e(\d{1,3})/i.exec(file) || /\b(\d{1,2})x(\d{1,3})\b/i.exec(file);
  if (coded) return { season: Number(coded[1]), episode: Number(coded[2]) };
  const parent = parts[parts.length - 1] || "";
  const seasonFolder = /season\s*(\d{1,2})/i.exec(parent) || /^s(\d{1,2})$/i.exec(parent);
  const fromFile = /(?:^|[^a-z])(?:episode|ep)[\s._-]*(\d{1,3})\b/i.exec(file) || /^e(\d{1,3})\b/i.exec(file) || /^(\d{1,3})(?:[\s._-]|$)/.exec(file.replace(/\.[^.]+$/, ""));
  if (seasonFolder && fromFile) return { season: Number(seasonFolder[1]), episode: Number(fromFile[1]) };
  return null;
}

export type EpisodeMark = { show: string; season: number; episode: number; name: string };

export type PlexShow = {
  id: string;
  title: string;
  year: string;
  poster: string;
  still: string;
  sourceLabel: string;
  episodes: Title[];
  seasons: { season: number; episodes: Title[] }[];
};

const TITLE_MARK = /^(.*?)\s·\sS(\d{1,2})E(\d{1,3})(?:\s·\s(.*))?$/i;

export function episodeMark(title: Pick<Title, "title" | "kind" | "path" | "folder" | "sourceLabel">): EpisodeMark | null {
  const named = TITLE_MARK.exec(title.title.trim());
  if (named) {
    return {
      show: named[1].trim() || "Show",
      season: Number(named[2]),
      episode: Number(named[3]),
      name: (named[4] || "").trim(),
    };
  }
  const rel = [title.folder, title.path].filter(Boolean).join("/");
  const ident = (rel && identityOf(rel)) || identityOf(title.title);
  if (!ident) return null;
  const parts = rel.replace(/\\/g, "/").split("/").filter(Boolean);
  if (/\.[a-z0-9]{2,4}$/i.test(parts[parts.length - 1] || "")) parts.pop();
  const parent = parts[parts.length - 1] || "";
  const show = /season|^s\d{1,2}$/i.test(parent) ? parts[parts.length - 2] || title.sourceLabel || "Show" : title.sourceLabel || "Show";
  return { show, season: ident.season, episode: ident.episode, name: "" };
}

export function episodeLabel(mark: EpisodeMark) {
  const code = `S${String(mark.season).padStart(2, "0")}E${String(mark.episode).padStart(2, "0")}`;
  return mark.name ? `${code} · ${mark.name}` : code;
}

export function organizeLibrary(titles: Title[]) {
  const movies: Title[] = [];
  const loose: Title[] = [];
  const groups = new Map<string, { show: string; source: string; rows: { title: Title; mark: EpisodeMark }[] }>();
  for (const title of titles) {
    const mark = episodeMark(title);
    if (!mark) {
      if (title.kind === "series") loose.push(title);
      else movies.push(title);
      continue;
    }
    const key = `${title.sourceLabel || ""}\0${mark.show.toLowerCase()}`;
    const group = groups.get(key) || { show: mark.show, source: title.sourceLabel || "", rows: [] };
    group.rows.push({ title, mark });
    groups.set(key, group);
  }
  for (const title of loose) {
    const key = `${title.sourceLabel || ""}\0${title.title.toLowerCase()}`;
    if (groups.has(key)) continue;
    groups.set(key, {
      show: title.title,
      source: title.sourceLabel || "",
      rows: [{ title, mark: { show: title.title, season: 1, episode: 1, name: "" } }],
    });
  }
  const shows: PlexShow[] = [...groups.values()].map((group) => {
    const rows = [...group.rows].sort(
      (a, b) => a.mark.season - b.mark.season || a.mark.episode - b.mark.episode || a.title.title.localeCompare(b.title.title, undefined, { numeric: true }),
    );
    const seasons = new Map<number, Title[]>();
    for (const row of rows) {
      const list = seasons.get(row.mark.season) || [];
      list.push(row.title);
      seasons.set(row.mark.season, list);
    }
    const first = rows[0]?.title;
    const year = rows.map((row) => row.title.year).find((item) => item && item !== "—") || "—";
    return {
      id: `show:${group.source}:${group.show.toLowerCase()}`,
      title: group.show,
      year,
      poster: first?.poster || "",
      still: first?.still || first?.poster || "",
      sourceLabel: group.source,
      episodes: rows.map((row) => row.title),
      seasons: [...seasons.entries()].map(([season, episodes]) => ({ season, episodes })),
    };
  });
  shows.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
  return { movies, shows };
}

/** The next episode after the last one that was finished. Mid-episode stays in Continue watching. */
export function onDeck(shows: PlexShow[], progress: Record<string, number>) {
  const picks: Title[] = [];
  for (const show of shows) {
    let lastDone = -1;
    show.episodes.forEach((episode, index) => {
      if ((progress[episode.id] ?? 0) >= 90) lastDone = index;
    });
    const next = show.episodes[lastDone + 1];
    if (lastDone >= 0 && next && (progress[next.id] ?? 0) < 90) picks.push(next);
  }
  return picks;
}

/** The following episode in the same show, in season order. */
export function nextEpisode(current: Title, titles: Title[]): Title | null {
  const mark = episodeMark(current);
  if (!mark) return null;
  const show = organizeLibrary(titles).shows.find(
    (item) => item.title.toLowerCase() === mark.show.toLowerCase() && (!current.sourceLabel || !item.sourceLabel || item.sourceLabel === current.sourceLabel),
  );
  if (!show) return null;
  const index = show.episodes.findIndex((episode) => episode.id === current.id);
  if (index < 0) return null;
  return show.episodes[index + 1] ?? null;
}
