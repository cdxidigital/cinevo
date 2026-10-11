export type StampId = "seat" | "keys" | "opening" | "feature" | "season" | "list" | "regular" | "encore";

export type Stamp = { id: StampId; name: string; detail: string; earned: boolean };

export type HouseRecord = { onboarded: boolean; visits: string[] };

export const EMPTY_HOUSE: HouseRecord = { onboarded: false, visits: [] };

const CATALOG: { id: StampId; name: string; detail: string }[] = [
  { id: "seat", name: "Took your seat", detail: "Finished the house tour" },
  { id: "keys", name: "House keys", detail: "Connected a library" },
  { id: "opening", name: "Opening night", detail: "Pressed play" },
  { id: "feature", name: "Full feature", detail: "Finished a film" },
  { id: "season", name: "Season ticket", detail: "Finished three episodes" },
  { id: "list", name: "My list", detail: "Saved three titles" },
  { id: "encore", name: "Encore", detail: "Came back on another night" },
  { id: "regular", name: "Regular", detail: "Opened the house three nights running" },
];

function dayBefore(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export function nightStreak(days: string[], today: string) {
  const have = new Set(days);
  let cursor = have.has(today) ? today : dayBefore(today);
  if (!have.has(cursor)) return 0;
  let count = 0;
  while (have.has(cursor)) {
    count += 1;
    cursor = dayBefore(cursor);
  }
  return count;
}

export function houseStamps(input: {
  onboarded: boolean;
  libraries: number;
  plays: number;
  finishedFilms: number;
  finishedEpisodes: number;
  saved: number;
  visits: string[];
  today: string;
}): Stamp[] {
  const nights = new Set(input.visits);
  const streak = nightStreak(input.visits, input.today);
  const earned = new Set<StampId>();
  if (input.onboarded) earned.add("seat");
  if (input.libraries > 0) earned.add("keys");
  if (input.plays > 0) earned.add("opening");
  if (input.finishedFilms > 0) earned.add("feature");
  if (input.finishedEpisodes >= 3) earned.add("season");
  if (input.saved >= 3) earned.add("list");
  if (nights.size >= 2) earned.add("encore");
  if (streak >= 3) earned.add("regular");
  return CATALOG.map((stamp) => ({ ...stamp, earned: earned.has(stamp.id) }));
}

export function houseRank(earned: number) {
  if (earned >= 6) return { name: "La Première", line: "The best seats are yours." };
  if (earned >= 3) return { name: "Dress circle", line: "A regular of the house." };
  if (earned >= 1) return { name: "Balcony", line: "You can see the screen from here." };
  return { name: "Lobby", line: "The doors are open." };
}

export function rememberVisit(visits: string[], today: string) {
  if (visits.includes(today)) return visits;
  return [today, ...visits].slice(0, 21);
}
