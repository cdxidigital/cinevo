import assert from "node:assert/strict";
import test from "node:test";
import { houseRank, houseStamps, nightStreak, rememberVisit } from "./house-card.ts";

test("three nights in a row is a streak, a gap is not", () => {
  assert.equal(nightStreak(["2026-10-05", "2026-10-04", "2026-10-03"], "2026-10-05"), 3);
  assert.equal(nightStreak(["2026-10-03"], "2026-10-05"), 0);
  assert.equal(rememberVisit(["2026-10-04"], "2026-10-05")[0], "2026-10-05");
});

test("stamps come from what the house already did", () => {
  const stamps = houseStamps({
    onboarded: true,
    libraries: 1,
    plays: 2,
    finishedFilms: 1,
    finishedEpisodes: 3,
    saved: 3,
    visits: ["2026-10-05", "2026-10-04"],
    today: "2026-10-05",
  });
  const earned = stamps.filter((stamp) => stamp.earned).map((stamp) => stamp.id);
  assert.deepEqual(earned, ["seat", "keys", "opening", "feature", "season", "list", "encore"]);
  assert.equal(houseRank(earned.length).name, "La Première");
  assert.equal(stamps.find((stamp) => stamp.id === "regular")?.earned, false);
});
