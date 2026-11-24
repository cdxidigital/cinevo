import type { LibraryTitle } from "./library";

/** Licensed Blender Foundation shorts (Creative Commons). Not the user's library. */
export const PREVIEW_PREFIX = "preview:";

export function isPreviewId(id: string | null | undefined) {
  return Boolean(id && id.startsWith(PREVIEW_PREFIX));
}

const still = "/stills/screen-glow.jpg";

export const PREVIEW_TITLES: LibraryTitle[] = [
  {
    id: "preview:bunny",
    title: "Big Buck Bunny",
    kind: "movie",
    year: "2008",
    runtime: "10m",
    genre: "Animation",
    genres: ["Animation", "Comedy"],
    synopsis: "A short by the Blender Foundation, licensed under Creative Commons. Preview only.",
    cast: [],
    director: "Sacha Goedegebure",
    studio: "Blender Foundation",
    contentRating: "G",
    writers: [],
    rating: 7.4,
    addedAt: "2008-04-10",
    poster: "/posters/stillwater.jpg",
    still,
    accent: "amber",
    source: "cinevo",
    sourceLabel: "Preview House",
    path: "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
  },
  {
    id: "preview:sintel",
    title: "Sintel",
    kind: "movie",
    year: "2010",
    runtime: "2m",
    genre: "Fantasy",
    genres: ["Fantasy", "Drama"],
    synopsis: "The Blender Foundation trailer, licensed under Creative Commons. Preview only.",
    cast: [],
    director: "Colin Levy",
    studio: "Blender Foundation",
    contentRating: "PG",
    writers: [],
    rating: 7.6,
    addedAt: "2010-09-27",
    poster: "/posters/ember-choir.jpg",
    still: "/stills/doorway.jpg",
    accent: "magenta",
    source: "cinevo",
    sourceLabel: "Preview House",
    path: "https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4",
  },
  {
    id: "preview:tears",
    title: "Tears of Steel",
    kind: "movie",
    year: "2012",
    runtime: "12m",
    genre: "Science Fiction",
    genres: ["Science Fiction"],
    synopsis: "A short by the Blender Foundation, licensed under Creative Commons. Preview only.",
    cast: [],
    director: "Ian Hubert",
    studio: "Blender Foundation",
    contentRating: "PG",
    writers: [],
    rating: 7.1,
    addedAt: "2012-09-26",
    poster: "/posters/quantum-horizon.jpg",
    still: "/stills/neon-alley.jpg",
    accent: "cyan",
    source: "cinevo",
    sourceLabel: "Preview House",
    path: "https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov",
  },
];

export function previewTitle(id: string | null | undefined) {
  return PREVIEW_TITLES.find((title) => title.id === id);
}

export function previewStream(id: string | null | undefined) {
  return previewTitle(id)?.path;
}

export function withoutPreviewIds<T extends string>(ids: T[]) {
  return ids.filter((id) => !isPreviewId(id));
}

export function withoutPreviewProgress(progress: Record<string, number>) {
  const next: Record<string, number> = {};
  for (const [id, value] of Object.entries(progress)) {
    if (!isPreviewId(id)) next[id] = value;
  }
  return next;
}
