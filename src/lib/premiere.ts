import type { MixMode } from "./house-mix";
import type { ThemeId } from "./library";

export type PremiereTitle = {
  id: string;
  title: string;
  year: string;
  kind: string;
  genre: string;
  rating: number;
  synopsis: string;
  runtime?: string;
  progress?: number;
  favorite?: boolean;
  path?: string;
  folder?: string;
};

export type PremierePlan = {
  line: string;
  playId: string;
  queueIds: string[];
  theme: ThemeId;
  lights: "premiere";
  mix?: MixMode;
  denoise?: boolean;
  steps?: string[];
};

const THEMES = new Set<ThemeId>(["ink", "harbor", "lilac", "ember", "grove", "rose", "gilt", "day"]);

function yearOf(title: PremiereTitle) {
  return title.year && title.year !== "—" ? ` (${title.year})` : "";
}

export function watchedRatio(progress?: number) {
  const n = progress ?? 0;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 1 ? Math.min(1, n / 100) : Math.min(1, n);
}

function unfinished(title: PremiereTitle) {
  return watchedRatio(title.progress) < 0.9;
}

function namedIn(question: string, titles: PremiereTitle[]) {
  const q = question.toLowerCase();
  return titles
    .filter((title) => title.title.length > 2 && q.includes(title.title.toLowerCase()))
    .sort((a, b) => b.title.length - a.title.length)[0];
}

function intentOf(question: string) {
  const q = question.toLowerCase();
  if (/\bshort\b|quick|episode/.test(q)) return "short" as const;
  if (/comfort|rewatch|familiar|easy/.test(q)) return "comfort" as const;
  if (/bold|sharp|dark|ink/.test(q)) return "bold" as const;
  return "premiere" as const;
}

export function planPremiere(question: string, titles: PremiereTitle[]): PremierePlan | null {
  const pool = titles.filter((title) => title.id && title.title.trim());
  if (!pool.length) return null;
  const intent = intentOf(question);
  let ranked = [...pool];
  if (intent === "short") {
    const shorts = ranked.filter((title) => title.kind === "series" || /^(~\s*)?(30|45|60|90)m/.test(title.runtime || ""));
    ranked = shorts.length ? shorts : ranked;
    ranked.sort((a, b) => Number(b.kind === "series") - Number(a.kind === "series") || a.title.localeCompare(b.title, undefined, { numeric: true }));
  } else if (intent === "comfort") {
    const known = ranked.filter((title) => title.favorite || watchedRatio(title.progress) > 0.05);
    ranked = known.length ? known : ranked;
    ranked.sort((a, b) => Number(b.favorite) - Number(a.favorite) || watchedRatio(b.progress) - watchedRatio(a.progress));
  } else if (intent === "bold") {
    ranked.sort((a, b) => b.rating - a.rating || Number(a.favorite) - Number(b.favorite));
  } else {
    const features = ranked.filter((title) => title.kind !== "series" && unfinished(title));
    const open = features.length ? features : ranked.filter(unfinished);
    ranked = open.length ? open : ranked;
    ranked.sort((a, b) => Number(b.kind !== "series") - Number(a.kind !== "series") || b.rating - a.rating || a.title.localeCompare(b.title, undefined, { numeric: true }));
  }
  const feature = namedIn(question, pool) ?? ranked[0];
  const theme: ThemeId = intent === "comfort" ? "ember" : intent === "bold" ? "ink" : intent === "short" ? "harbor" : "gilt";
  const favorites = pool.filter((title) => title.favorite).slice(0, 3).map((title) => title.id);
  const queueIds = (intent === "comfort" && favorites.length ? favorites : [feature.id]).slice(0, 4);
  if (!queueIds.includes(feature.id)) queueIds.unshift(feature.id);
  const year = yearOf(feature);
  const line =
    intent === "premiere"
      ? `La Première. Gilt glass, lights down. We open with ${feature.title}${year}.`
      : intent === "comfort"
        ? `A quieter house. Warm light, and ${feature.title}${year} from what you already know.`
        : intent === "short"
          ? `A short sitting. ${feature.title}${year}, then the lights come up.`
          : `Sharper picture. ${feature.title}${year}, in ink.`;
  return { line, playId: feature.id, queueIds: queueIds.slice(0, 4), theme, lights: "premiere" };
}

export function parseAttendant(raw: string, titles: PremiereTitle[]): Partial<PremierePlan> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const body = JSON.parse(raw.slice(start, end + 1)) as {
      line?: string;
      play?: string;
      queue?: string[];
      theme?: string;
    };
    const byName = (name: string) => titles.find((title) => title.title.toLowerCase() === name.trim().toLowerCase());
    const play = typeof body.play === "string" ? byName(body.play) : undefined;
    const queueIds = Array.isArray(body.queue)
      ? body.queue.map((name) => (typeof name === "string" ? byName(name)?.id : undefined)).filter((id): id is string => Boolean(id))
      : [];
    const theme = typeof body.theme === "string" && THEMES.has(body.theme as ThemeId) ? (body.theme as ThemeId) : undefined;
    return {
      line: typeof body.line === "string" ? body.line.replace(/\s+/g, " ").trim().slice(0, 280) : undefined,
      playId: play?.id,
      queueIds: queueIds.slice(0, 4),
      theme,
      lights: "premiere",
    };
  } catch {
    return null;
  }
}

export function mergeAttendant(base: PremierePlan, extra: Partial<PremierePlan> | null): PremierePlan {
  if (!extra) return base;
  const playId = extra.playId || base.playId;
  const queueIds = extra.queueIds?.length ? extra.queueIds : base.queueIds;
  return {
    line: extra.line || base.line,
    playId,
    queueIds: queueIds.includes(playId) ? queueIds : [playId, ...queueIds].slice(0, 4),
    theme: extra.theme || base.theme,
    lights: "premiere",
  };
}
