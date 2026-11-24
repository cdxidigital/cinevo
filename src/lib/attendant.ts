import type { Title } from "./catalog.ts";
import { onDeck, organizeLibrary } from "./plex-shelf.ts";
import { planPremiere, watchedRatio, type PremierePlan, type PremiereTitle } from "./premiere.ts";

function houseMix(_theme: string): NonNullable<PremierePlan["mix"]> {
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

function minutesOf(runtime?: string) {
  const match = runtime?.match(/(\d+)\s*m/i);
  return match ? Number(match[1]) : null;
}

function genreOf(title: PremiereTitle) {
  return title.genre.trim().toLowerCase();
}

function filmsLike(seed: PremiereTitle, pool: PremiereTitle[]) {
  const genre = genreOf(seed);
  return pool.filter((title) => title.id !== seed.id && title.kind !== "series" && genre && genreOf(title) === genre && watchedRatio(title.progress) < 0.9);
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
        return seat(`The rest of ${show.title}, from ${play.title}.`, play, queue, "ink", "premiere", [
          `Opened ${show.title}`,
          `Queued ${queue.length} episode${queue.length === 1 ? "" : "s"} still ahead`,
          "Ink glass, denoise on",
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
      return seat(`Picking up ${open.title}, at ${Math.round(watchedRatio(open.progress) * 100)}%.`, open, [open], "ember", "premiere", [
        "Found the title you had started",
        "Ember glass, denoise on",
      ]);
    }
  }

  if (/unwatched|haven'?t seen|not seen|new to me/.test(q)) {
    const fresh = pool
      .filter((title) => title.kind !== "series" && watchedRatio(title.progress) < 0.02)
      .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));
    const play = fresh[0];
    if (play) {
      return seat(`Unwatched. ${play.title}.`, play, fresh.slice(0, 4), "lilac", "premiere", [
        "Skipped anything already started",
        `Opened ${play.title}`,
        "Lilac glass, premiere mix, denoise on",
      ]);
    }
  }

  if (/something like the last|like the last|similar to what/.test(q)) {
    const started = [...pool]
      .filter((title) => title.kind !== "series" && watchedRatio(title.progress) > 0.02)
      .sort((a, b) => watchedRatio(b.progress) - watchedRatio(a.progress))[0];
    const kin = started ? filmsLike(started, pool) : [];
    const play = kin[0];
    if (started && play) {
      return seat(`In the same room as ${started.title}. ${play.title}.`, play, [play, ...kin.slice(1, 3)], "rose", "premiere", [
        `Matched the genre of ${started.title}`,
        `Next is ${play.title}`,
        "Rose glass, denoise on",
      ]);
    }
  }

  if (/surprise/.test(q)) {
    const open = pool
      .filter((title) => title.kind !== "series" && watchedRatio(title.progress) < 0.9)
      .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));
    const play = open[1] || open[0];
    if (play) {
      return seat(`A surprise from the shelf. ${play.title}.`, play, open.slice(0, 3), "grove", "premiere", [
        "Left the obvious first choice",
        `Opened ${play.title}`,
        "Grove glass, denoise on",
      ]);
    }
  }

  if (/under ninety|under 90|short sitting|short film/.test(q)) {
    const brief = pool.filter((title) => {
      const minutes = minutesOf(title.runtime);
      return watchedRatio(title.progress) < 0.9 && (title.kind === "series" || (minutes !== null && minutes <= 90));
    });
    const play = brief[0];
    if (play) {
      return seat(`A short sitting. ${play.title}.`, play, brief.slice(0, 4), "harbor", "premiere", [
        "Kept it to a series episode or under ninety minutes",
        `Opened ${play.title}`,
        "Harbor glass, premiere mix, denoise on",
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
