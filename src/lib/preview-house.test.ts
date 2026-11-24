import assert from "node:assert/strict";
import test from "node:test";
import { personalBadges, watchStreak } from "./milestones.ts";
import { PREVIEW_TITLES, isPreviewId, withoutPreviewProgress } from "./preview-house.ts";

test("preview progress is not a real library record", () => {
  const kept = withoutPreviewProgress({ "preview:bunny": 40, "real-1": 12 });
  assert.deepEqual(kept, { "real-1": 12 });
  assert.equal(isPreviewId(PREVIEW_TITLES[0]?.id), true);
  assert.equal(PREVIEW_TITLES.every((title) => title.sourceLabel === "Preview House"), true);
});

test("badges stay personal and do not invent a ranking", () => {
  const badges = personalBadges({
    titles: PREVIEW_TITLES,
    progress: { "preview:bunny": 100 },
    favorites: [],
    offlineIds: [],
    plays: 1,
  });
  assert.equal(badges.some((badge) => /friend|rank|leader/i.test(badge.label)), false);
  assert.equal(watchStreak(["2026-10-10", "2026-10-11", "2026-10-12"], "2026-10-12"), 3);
  assert.equal(watchStreak(["2026-10-10"], "2026-10-12"), 0);
});
