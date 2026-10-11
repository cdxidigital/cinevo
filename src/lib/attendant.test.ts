import assert from "node:assert/strict";
import test from "node:test";
import { runAttendant } from "./attendant.ts";
import type { PremiereTitle } from "./premiere.ts";

const house: PremiereTitle[] = [
  { id: "e1", title: "Show · S01E01", year: "2011", kind: "series", genre: "Drama", rating: 7, synopsis: "", progress: 100 },
  { id: "e2", title: "Show · S01E02 · Rain", year: "2011", kind: "series", genre: "Drama", rating: 7, synopsis: "", progress: 0 },
  { id: "e3", title: "Show · S01E03 · Glass", year: "2011", kind: "series", genre: "Drama", rating: 8, synopsis: "", progress: 0 },
  { id: "film", title: "Harbor Lights", year: "1978", kind: "movie", genre: "Drama", rating: 9, synopsis: "", progress: 40 },
  { id: "other", title: "Night Crossing", year: "1982", kind: "movie", genre: "Noir", rating: 8, synopsis: "", progress: 0 },
];

test("resume uses percent progress, not a finished episode", () => {
  const plan = runAttendant("resume where I left off", house);
  assert.equal(plan?.playId, "film");
  assert.match(plan?.line || "", /40%/);
});

test("on deck is the episode after the one that finished", () => {
  const plan = runAttendant("what is on deck", house);
  assert.equal(plan?.playId, "e2");
  assert.equal(plan?.queueIds[0], "e2");
});

test("a binge queues the rest of the show and nothing invented", () => {
  const plan = runAttendant("binge the rest of Show", house);
  assert.deepEqual(plan?.queueIds, ["e2", "e3"]);
  assert.equal(plan?.playId, "e2");
  assert.equal(plan?.queueIds.includes("film"), false);
});
