import type { Title } from "./catalog.ts";
import { onDeck, organizeLibrary } from "./plex-shelf.ts";
import { planPremiere, watchedRatio, type PremierePlan, type PremiereTitle } from "./premiere.ts";

function houseMix(theme: string): NonNullable<PremierePlan["mix"]> {
  if (theme === "ember" || theme === "grove") return "night";
  if (theme === "ink") return "dialogue";
  return "premiere";
}

function asTitle(title: PremiereTitle): Title {
  return {
    id: title.id,
    title: title.title,
    kind: title.kind === "series" ? "series" : "movie",
    year: title.year || "—",
    runtime: title.runtime || "—",
    genre: title.genre || "",
    genres: title.genre ? [title.genre] : [],
    synopsis: title.synopsis || "",
    cast: [],
    director: "",
    rating: title.rating || 0,
    addedAt: "",
    poster: "",
    still: "",
    accent: "cyan",
    sourceLabel: "",
    folder: title.folder,
    path: title.path,
  };
}

function percent(titles: PremiereTitle[]) {
  const progress: Record<string, number> = {};
  for (const title of titles) progress[title.id] = Math.round(watchedRatio(title.progress) * 100);
  return progress;
}

function seat(
  line: string,
  play: PremiereTitle,
  queue: PremiereTitle[],
  theme: PremierePlan["theme"],
  mix: NonNullable<PremierePlan["mix"]>,
  steps: string[],
): PremierePlan {
  const queueIds = queue.map((title) => title.id).slice(0, 8);
  if (!queueIds.includes(play.id)) queueIds.unshift(play.id);
  return {
    line,
    playId: play.id,
    queueIds: queueIds.slice(0, 8),
    theme,
    lights: "premiere",
    mix,
    denoise: true,
    steps,
  };
}

/** A house agent. It only acts on titles already in the library. */
export function runAttendant(question: string, titles: PremiereTitle[]): PremierePlan | null {
  const pool = titles.filter((title) => title.id && title.title.trim());
  if (!pool.length) return null;
  const q = question.toLowerCase();
  const shelf = organizeLibrary(pool.map(asTitle));
  const progress = percent(pool);
  const byId = new Map(pool.map((title) => [title.id, title]));
  const namedShow = shelf.shows
    .filter((show) => show.title.length > 2 && q.includes(show.title.toLowerCase()))
    .sort((a, b) => b.title.length - a.title.length)[0];

  if (/\bon deck\b|next episode|next up/.test(q)) {
    const shows = namedShow ? [namedShow] : shelf.shows;
    const next = onDeck(shows, progress)[0];
    const row = next ? byId.get(next.id) : undefined;
    if (row) {
      const show = shows.find((item) => item.episodes.some((episode) => episode.id === row.id));
      const rest = show ? show.episodes.map((episode) => byId.get(episode.id)).filter((item): item is PremiereTitle => Boolean(item)) : [row];
      const from = Math.max(0, rest.findIndex((item) => item.id === row.id));
      return seat(`On deck. ${row.title}.`, row, rest.slice(from, from + 4), "harbor", "premiere", [
        "Read which episodes were finished",
        `Next is ${row.title}`,
        "Harbor glass, premiere mix, denoise on",
      ]);
    }
  }

  if (/binge|rest of the season|rest of the show|keep going/.test(q)) {
    const show =
      namedShow ||
      shelf.shows.find((item) => item.episodes.some((episode) => (progress[episode.id] ?? 0) > 0)) ||
      shelf.shows[0];
    if (show) {
      const rows = show.episodes.map((episode) => byId.get(episode.id)).filter((item): item is PremiereTitle => Boolean(item));
      const start = rows.findIndex((item) => watchedRatio(item.progress) < 0.9);
      const queue = rows.slice(start < 0 ? 0 : start, (start < 0 ? 0 : start) + 6);
      const play = queue[0];
      if (play) {
        return seat(`The rest of ${show.title}, from ${play.title}.`, play, queue, "ink", "night", [
          `Opened ${show.title}`,
          `Queued ${queue.length} episode${queue.length === 1 ? "" : "s"} still ahead`,
          "Ink glass, night mix, denoise on",
        ]);
      }
    }
  }

  if (/resume|continue|pick up|left off|where i was/.test(q)) {
    const open = [...pool]
      .filter((title) => {
        const seen = watchedRatio(title.progress);
        return seen > 0.02 && seen < 0.9;
      })
      .sort((a, b) => watchedRatio(b.progress) - watchedRatio(a.progress))[0];
    if (open) {
      return seat(`Picking up ${open.title}, at ${Math.round(watchedRatio(open.progress) * 100)}%.`, open, [open], "ember", "night", [
        "Found the title you had started",
        "Ember glass, night mix, denoise on",
      ]);
    }
  }

  if (/double feature|two films|two movies/.test(q)) {
    const films = pool
      .filter((title) => title.kind !== "series" && watchedRatio(title.progress) < 0.9)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 2);
    if (films[0]) {
      return seat(
        films[1] ? `A double feature. ${films[0].title}, then ${films[1].title}.` : `One feature is ready. ${films[0].title}.`,
        films[0],
        films,
        "gilt",
        "premiere",
        ["Chose unfinished films", films[1] ? "Queued the second feature" : "Only one unfinished film in the house", "Gilt glass, premiere mix, denoise on"],
      );
    }
  }

  const planned = planPremiere(question, pool);
  if (!planned) return null;
  const feature = pool.find((title) => title.id === planned.playId);
  return {
    ...planned,
    mix: houseMix(planned.theme),
    denoise: true,
    steps: [
      feature ? `Chose ${feature.title}` : "Chose a title from this house",
      `${planned.theme} glass, ${houseMix(planned.theme)} mix, denoise on`,
    ],
  };
}
