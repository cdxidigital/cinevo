import type { Title } from "./catalog";

export type Badge = { id: string; label: string; detail: string };

export function watchStreak(visits: string[], today = new Date().toISOString().slice(0, 10)) {
  const days = new Set(visits.filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)));
  if (!days.has(today)) return 0;
  let streak = 0;
  const cursor = new Date(`${today}T00:00:00Z`);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

/** Personal only. Calculated from this house, never compared with anyone else. */
export function personalBadges(input: {
  titles: Title[];
  progress: Record<string, number>;
  favorites: string[];
  offlineIds: string[];
  plays: number;
}) {
  const badges: Badge[] = [];
  const finished = input.titles.filter((title) => (input.progress[title.id] ?? 0) >= 90);
  const films = finished.filter((title) => title.kind !== "series");
  const genres = new Set(input.titles.flatMap((title) => title.genres || []).filter(Boolean));
  if (input.plays > 0) badges.push({ id: "first-night", label: "First sitting", detail: "You pressed play in this house." });
  if (films.length >= 1) badges.push({ id: "one-film", label: "A film, finished", detail: "One feature reached the end." });
  if (films.length >= 10) badges.push({ id: "ten-films", label: "Ten films", detail: "Ten films finished in this house." });
  if (genres.size >= 5) badges.push({ id: "five-genres", label: "Five genres", detail: "This library already spans five genres." });
  if (input.favorites.length >= 1) badges.push({ id: "my-list", label: "My List", detail: "Something was kept." });
  if (input.offlineIds.length >= 1) badges.push({ id: "offline", label: "First offline title", detail: "A title is saved on this device." });
  const short = input.titles.some((title) => {
    const minutes = Number((title.runtime || "").match(/(\d+)/)?.[1] || 0);
    return minutes > 0 && minutes <= 90 && (input.progress[title.id] ?? 0) >= 90;
  });
  if (short) badges.push({ id: "under-90", label: "Under 90 minutes", detail: "A short sitting, finished." });
  return badges;
}
