import assert from "node:assert/strict";
import test from "node:test";
import type { Title } from "./catalog.ts";
import { episodeLabel, nextEpisode, onDeck, organizeLibrary } from "./plex-shelf.ts";

function row(partial: Partial<Title> & Pick<Title, "id" | "title">): Title {
  return {
    kind: "series",
    year: "2011",
    runtime: "45m",
    genre: "Drama",
    genres: ["Drama"],
    synopsis: "",
    cast: [],
    director: "",
    rating: 0,
    addedAt: "2024-01-01",
    poster: "",
    still: "",
    accent: "cyan",
    sourceLabel: "NAS",
    ...partial,
  };
}

test("a scan becomes movies and shows, with seasons in order", () => {
  const shelf = organizeLibrary([
    row({ id: "e10", title: "Show · S01E10 · Glass" }),
    row({ id: "e2", title: "Show · S01E02 · Rain" }),
    row({ id: "e1", title: "Show · S01E01" }),
    row({ id: "film", title: "Harbor Lights", kind: "movie", year: "1978" }),
    row({ id: "parent", title: "Show", kind: "series" }),
  ]);
  assert.equal(shelf.movies.length, 1);
  assert.equal(shelf.movies[0].title, "Harbor Lights");
  assert.equal(shelf.shows.length, 1);
  assert.equal(shelf.shows[0].title, "Show");
  assert.deepEqual(
    shelf.shows[0].episodes.map((item) => item.id),
    ["e1", "e2", "e10"],
  );
  assert.equal(shelf.shows[0].seasons.length, 1);
  assert.equal(episodeLabel({ show: "Show", season: 1, episode: 2, name: "Rain" }), "S01E02 · Rain");
});

test("the next episode follows season order", () => {
  const titles = [
    row({ id: "e2", title: "Show · S01E02 · Rain" }),
    row({ id: "e1", title: "Show · S01E01" }),
    row({ id: "s2", title: "Show · S02E01 · Later" }),
    row({ id: "film", title: "Harbor Lights", kind: "movie" }),
  ];
  assert.equal(nextEpisode(titles[1], titles)?.id, "e2");
  assert.equal(nextEpisode(titles[0], titles)?.id, "s2");
  assert.equal(nextEpisode(titles[2], titles), null);
  assert.equal(nextEpisode(titles[3], titles), null);
});

test("on deck is the episode after the last finished one", () => {
  const shelf = organizeLibrary([
    row({ id: "e1", title: "Show · S01E01" }),
    row({ id: "e2", title: "Show · S01E02 · Rain" }),
  ]);
  assert.equal(onDeck(shelf.shows, { e1: 100 })[0]?.id, "e2");
  assert.equal(onDeck(shelf.shows, { e1: 40 }).length, 0);
});
