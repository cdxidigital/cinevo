import assert from "node:assert/strict";
import test from "node:test";
import { mergeAttendant, parseAttendant, planPremiere, type PremiereTitle } from "./premiere.ts";

const house: PremiereTitle[] = [
  { id: "a", title: "Harbor Lights", year: "1978", kind: "movie", genre: "Drama", rating: 8, synopsis: "A night crossing.", runtime: "~2h" },
  { id: "b", title: "Show · S01E02 · Rain", year: "2011", kind: "series", genre: "Series", rating: 7, synopsis: "Second hour.", runtime: "~45m", favorite: true, progress: 0.4 },
  { id: "c", title: "Show · S01E10 · Glass", year: "2011", kind: "series", genre: "Series", rating: 9, synopsis: "Later hour.", runtime: "~45m" },
];

test("a premiere opens a feature in gilt, not a later episode", () => {
  const plan = planPremiere("Prepare la premiere", house);
  assert.ok(plan);
  assert.equal(plan.playId, "a");
  assert.equal(plan.theme, "gilt");
  assert.match(plan.line, /Harbor Lights/);
  assert.equal(plan.line.includes("S01E10"), false);
});

test("comfort stays with a title already started", () => {
  const plan = planPremiere("something comforting", house);
  assert.equal(plan?.playId, "b");
  assert.equal(plan?.theme, "ember");
});

test("the attendant cannot invent a title", () => {
  const parsed = parseAttendant(
    '{"line":"We open with a film that is not here.","play":"Not In The House","queue":["Harbor Lights"],"theme":"gilt"}',
    house,
  );
  const plan = mergeAttendant(planPremiere("premiere", house)!, parsed);
  assert.equal(plan.playId, "a");
  assert.deepEqual(plan.queueIds, ["a"]);
  assert.match(plan.line, /not here/);
});
