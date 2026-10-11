import { useMemo, useState } from "react";
import { houseRank, houseStamps } from "@/lib/house-card";
import { organizeLibrary } from "@/lib/plex-shelf";
import { progressBands, useCinevo } from "@/lib/cinevo-store";

const STEPS = [
  {
    kicker: "Welcome",
    title: "This is your house.",
    body: "Films stay one poster. A show opens into seasons and episodes, in order.",
  },
  {
    kicker: "The pictures",
    title: "Bring a library with you.",
    body: "Sign Plex or Jellyfin in once. A folder or CINEVO Node works too. It stays on this account after you leave.",
  },
  {
    kicker: "The night",
    title: "The attendant can run the room.",
    body: "Ask it to resume, binge, or seat a premiere. Next, on the player, starts the following episode.",
  },
];

export function Onboarding() {
  const hydrated = useCinevo((s) => s.hydrated);
  const onboarded = useCinevo((s) => s.house.onboarded);
  const playingId = useCinevo((s) => s.playingId);
  const finish = useCinevo((s) => s.finishOnboarding);
  const setRoom = useCinevo((s) => s.setRoom);
  const [step, setStep] = useState(0);
  if (!hydrated || onboarded || playingId) return null;
  const card = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className="house-page house-page--flow">
      <section className="max-w-lg" aria-label="Welcome to CINEVO">
        <p className="house-kicker">{card.kicker}</p>
        <h2 className="mt-2 font-ui text-3xl font-semibold tracking-tight">{card.title}</h2>
        <p className="mt-3 text-cine-muted">{card.body}</p>
        <p className="mt-5 font-ui text-xs tracking-[0.14em] text-cine-faint">
          {step + 1} of {STEPS.length}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button type="button" className="house-btn house-btn--ghost" onClick={() => finish()}>
            Skip for now
          </button>
          {last ? (
            <button
              type="button"
              className="house-btn house-btn--play"
              onClick={() => {
                finish();
                setRoom("sidebar");
              }}
            >
              Add a library
            </button>
          ) : (
            <button type="button" className="house-btn house-btn--play" onClick={() => setStep((n) => n + 1)}>
              Next
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

export function HouseCard() {
  const house = useCinevo((s) => s.house);
  const sources = useCinevo((s) => s.sources.length);
  const plays = useCinevo((s) => s.plays.length);
  const saved = useCinevo((s) => s.favorites.length);
  const bands = useCinevo((s) => progressBands(s.progress));
  const local = useCinevo((s) => s.localTitles);
  const remote = useCinevo((s) => s.remoteTitles);
  const [open, setOpen] = useState(false);
  const stamps = useMemo(() => {
    const progress = useCinevo.getState().progress;
    const shelf = organizeLibrary([...local, ...remote]);
    const finishedFilms = shelf.movies.filter((title) => (progress[title.id] ?? 0) >= 90).length;
    const finishedEpisodes = shelf.shows.flatMap((show) => show.episodes).filter((title) => (progress[title.id] ?? 0) >= 90).length;
    return houseStamps({
      onboarded: house.onboarded,
      libraries: sources,
      plays,
      finishedFilms,
      finishedEpisodes,
      saved,
      visits: house.visits,
      today: new Date().toISOString().slice(0, 10),
    });
  }, [bands, house.onboarded, house.visits, sources, plays, saved, local, remote]);
  const earned = stamps.filter((stamp) => stamp.earned);
  const rank = houseRank(earned.length);
  return (
    <section className="mb-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <button type="button" className="flex w-full items-baseline justify-between gap-3 text-left" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span>
          <b className="block font-ui text-sm tracking-[0.12em] text-cine-cyan">{rank.name}</b>
          <span className="text-sm text-cine-muted">{rank.line}</span>
        </span>
        <span className="font-ui text-sm text-cine-faint">
          {earned.length} of {stamps.length}
        </span>
      </button>
      {open ? (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {stamps.map((stamp) => (
            <li key={stamp.id} className={stamp.earned ? "rounded-xl border border-white/15 bg-white/5 px-3 py-2" : "rounded-xl border border-white/5 px-3 py-2 opacity-50"}>
              <b className="block font-ui text-sm">{stamp.name}</b>
              <span className="text-xs text-cine-faint">{stamp.detail}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-cine-faint">{earned.length ? earned.map((stamp) => stamp.name).join(" · ") : "Stamps appear as you use the house."}</p>
      )}
    </section>
  );
}
