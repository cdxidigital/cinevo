import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Cast, Check, ChevronLeft, ListPlus, Play, Search, Star, X } from "lucide-react";
import { filterCatalog, similarTo, type Title } from "@/lib/catalog";
import { libraryPool, titleById, useCinevo } from "@/lib/cinevo-store";
import { askCinevo } from "@/lib/ask-cinevo";
import type { PremierePlan } from "@/lib/premiere";
import { mixForTheme } from "@/lib/house-mix";
import { Rail, ArtImage } from "./poster";
import { InstallerCards } from "./installers";
import { HouseRemote, InstallCinevo } from "./house-remote";
import { AccountSettings } from "./account";
import { Link } from "@tanstack/react-router";
import { THEMES } from "@/lib/library";
import { SharePanel } from "./share-panel";
import { openCast } from "./cast-sheet";
import { getMyProfile } from "@/lib/sharing";

const AI_PRESETS = [
  { label: "On deck", q: "What is on deck?" },
  { label: "Resume", q: "Resume where I left off." },
  { label: "Binge", q: "Binge the rest of the season." },
  { label: "Double feature", q: "Build a double feature from films I have not finished." },
  { label: "La Première", q: "Prepare La Première from a feature I have not finished." },
];

export function Detail() {
  const id = useCinevo((s) => s.selectedId);
  const closeTitle = useCinevo((s) => s.closeTitle);
  const play = useCinevo((s) => s.play);
  const fav = useCinevo((s) => (id ? s.favorites.includes(id) : false));
  const queued = useCinevo((s) => (id ? s.tonight.includes(id) : false));
  const progress = useCinevo((s) => (id ? s.progress[id] ?? 0 : 0));
  const toggleFavorite = useCinevo((s) => s.toggleFavorite);
  const addTonight = useCinevo((s) => s.addTonight);
  const removeTonight = useCinevo((s) => s.removeTonight);
  const addNote = useCinevo((s) => s.addNote);
  const title = titleById(id);
  const [note, setNote] = useState("");
  useEffect(() => {
    setNote("");
  }, [id]);
  if (!title) return null;
  const similar = similarTo(title, libraryPool());
  const director = title.director && title.director !== title.sourceLabel ? title.director : "";
  const genres = (title.genres || []).filter((genre) => genre && genre !== title.sourceLabel && genre !== "Plex" && genre !== "Jellyfin");
  const facts: [string, string][] = [
    ["Year", title.year],
    [title.kind === "series" ? "Episode" : "Length", title.runtime],
    ["Rated", title.contentRating || ""],
    ["Studio", title.studio || ""],
    ["Director", director],
    ["Genres", genres.join(", ") || title.genre],
    ["From", title.sourceLabel || ""],
  ].filter((item): item is [string, string] => Boolean(item[1] && item[1] !== "—"));
  return (
    <div className="house-detail">
      <ArtImage src={title.still || title.poster} fallback="/stills/theater.jpg" className="house-detail__art" eager />
      <div className="house-detail__veil" />
      <div className="house-detail__inner">
        <button type="button" onClick={closeTitle} className="house-back">
          <ChevronLeft size={16} /> Back
        </button>
        <div className="house-detail__copy">
          <p className="house-kicker">{title.kind === "series" ? "Series" : "Feature"}</p>
          <h1>{title.title}</h1>
          <p className="house-meta">
            <span>{title.year}</span>
            <i />
            <span>{title.runtime}</span>
            <i />
            <span>{title.genre}</span>
            {title.rating > 0 ? (
              <>
                <i />
                <span>
                  <Star size={12} className="inline text-cine-amber" fill="currentColor" /> {title.rating.toFixed(1)}
                </span>
              </>
            ) : null}
          </p>
          <ul className="detail-facts">
            {facts.map(([label, value]) => (
              <li key={label}>
                <span>{label}</span>
                <b>{value}</b>
              </li>
            ))}
          </ul>
          <div className="house-actions">
            <button type="button" onClick={() => play(title.id)} className="house-btn house-btn--play">
              <Play size={16} fill="currentColor" /> {progress > 0 && progress < 100 ? "Resume" : "Play"}
            </button>
            <button type="button" onClick={() => toggleFavorite(title.id)} className="house-btn house-btn--ghost">
              {fav ? <Check size={16} /> : <ListPlus size={16} />}
              {fav ? "In My List" : "My List"}
            </button>
            <button
              type="button"
              onClick={() => (queued ? removeTonight(title.id) : addTonight(title.id))}
              className="house-btn house-btn--ghost"
            >
              {queued ? "Queued" : "Tonight"}
            </button>
            <button type="button" onClick={() => openCast({ titleId: title.id })} className="house-btn house-btn--ghost">
              <Cast size={16} /> Cast
            </button>
          </div>
          <p className="mt-7 max-w-xl text-cine-muted">{title.synopsis}</p>
          <p className="mt-4 font-ui text-sm text-cine-faint">
            {title.writers?.length ? `Written by ${title.writers.join(", ")}` : null}
            {title.writers?.length && title.cast.length ? " · " : null}
            {title.cast.length ? `Cast · ${title.cast.join(", ")}` : null}
            {title.folder ? ` · ${title.folder.split("/").filter(Boolean).slice(-2).join(" / ")}` : null}
          </p>
        </div>
        <form
          className="mt-10 max-w-xl"
          onSubmit={(e) => {
            e.preventDefault();
            addNote(title.id, note);
            setNote("");
          }}
        >
          <label className="house-kicker">A note on this title</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={280}
            placeholder="Private. Stays on this device."
            className="mt-2 h-20 w-full rounded-md border border-cine-border bg-cine-well p-3 font-ui"
          />
          <button type="submit" className="house-btn house-btn--ghost mt-2">
            Save note
          </button>
        </form>
        <div className="mt-14">
          <Rail heading="Similar titles" titles={similar} />
        </div>
      </div>
    </div>
  );
}

function SearchThumb({ title }: { title: Title }) {
  const [broken, setBroken] = useState(!title.poster);
  useEffect(() => setBroken(!title.poster), [title.poster, title.id]);
  if (broken) {
    return (
      <span className="search-thumb" aria-hidden="true">
        {title.title.slice(0, 1)}
      </span>
    );
  }
  return (
    <span className="search-thumb">
      <img src={title.poster} alt="" onError={() => setBroken(true)} />
    </span>
  );
}

export function SearchOverlay() {
  const open = useCinevo((s) => s.searchOpen);
  const setSearchOpen = useCinevo((s) => s.setSearchOpen);
  const setLibraryQuery = useCinevo((s) => s.setLibraryQuery);
  const setRoom = useCinevo((s) => s.setRoom);
  const openTitle = useCinevo((s) => s.openTitle);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const extra = useCinevo((s) => s.localTitles);
  const remote = useCinevo((s) => s.remoteTitles);
  const results = useMemo(() => {
    const query = q.trim();
    if (!query) return [];
    return filterCatalog({ query, pool: [...extra, ...remote] }).slice(0, 24);
  }, [q, extra, remote]);
  useEffect(() => {
    if (!open) setQ("");
  }, [open]);
  const showInLibrary = () => {
    const query = q.trim();
    if (!query) return;
    setLibraryQuery(query);
    setRoom("browse");
    setSearchOpen(false);
    void navigate({ to: "/app", search: { room: "browse" } });
  };
  if (!open) return null;
  return (
    <div className="house-page house-page--flow">
      <button type="button" className="house-back" onClick={() => setSearchOpen(false)}>
        <ChevronLeft size={16} /> Back
      </button>
      <section aria-label="Search">
        <div className="flex items-center gap-3 rounded-lg border border-cine-border bg-cine-well px-3">
          <Search size={16} className="text-cine-cyan" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your library"
            aria-label="Search your library"
            className="h-12 flex-1 bg-transparent font-ui text-base outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && q.trim()) showInLibrary();
            }}
          />
          <button type="button" aria-label="Close search" className="flex size-11 items-center justify-center" onClick={() => setSearchOpen(false)}>
            <X size={16} />
          </button>
        </div>
        <p className="mt-3 font-mono text-xs text-cine-faint">
          {extra.length + remote.length === 0
            ? "Nothing in your library yet."
            : !q.trim()
              ? "Type a title, person, year, folder, or studio."
              : results.length
                ? `${results.length} ${results.length === 1 ? "match" : "matches"} · Enter opens the library`
                : "No matches."}
        </p>
        {q.trim() && results.length ? (
          <button type="button" className="house-btn house-btn--ghost mt-3 h-11 w-full" onClick={showInLibrary}>
            Show all in the library
          </button>
        ) : null}
        <div className="search-results">
          {results.map((t) => (
            <button
              key={t.id}
              type="button"
              className="flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-cine-well"
              onClick={() => {
                openTitle(t.id);
                setSearchOpen(false);
              }}
            >
              <SearchThumb title={t} />
              <span className="min-w-0">
                <b className="block truncate font-ui">{t.title}</b>
                <small className="text-cine-faint">
                  {[t.year, t.genre, t.studio, t.contentRating, t.folder?.split("/").filter(Boolean).slice(-1)[0]]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SettingsModal() {
  const open = useCinevo((s) => s.settingsOpen);
  const setSettingsOpen = useCinevo((s) => s.setSettingsOpen);
  const prefs = useCinevo((s) => s.prefs);
  const patchPrefs = useCinevo((s) => s.patchPrefs);
  const setTheme = useCinevo((s) => s.setTheme);
  const clearLocalData = useCinevo((s) => s.clearLocalData);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!open) setConfirmClear(false);
  }, [open]);
  if (!open) return null;
  const rows: { key: "nightMode" | "zenMode" | "focusMode"; label: string; hint: string }[] = [
    { key: "nightMode", label: "Dim the billboard", hint: "Darken featured art. Colors stay with the theme." },
    { key: "zenMode", label: "Zen mode", hint: "Hide poster metadata" },
    { key: "focusMode", label: "Focus player", hint: "Quieter playback chrome" },
  ];
  return (
    <div className="house-page house-page--flow">
      <button type="button" className="house-back" onClick={() => setSettingsOpen(false)}>
        <ChevronLeft size={16} /> Back
      </button>
      <section className="max-w-lg" aria-label="Settings">
        <header className="mb-4 flex items-start justify-between">
          <div>
            <p className="font-ui text-xs font-semibold tracking-[0.12em] text-cine-cyan">HOUSE</p>
            <h2 className="font-ui text-lg font-semibold tracking-tight">Settings</h2>
          </div>
          <button type="button" aria-label="Close settings" onClick={() => setSettingsOpen(false)}>
            <X size={18} />
          </button>
        </header>
        <div className="space-y-3">
          <AccountSettings />
          <p className="font-ui text-xs font-semibold tracking-[0.1em] text-cine-cyan">THEME</p>
          <div className="theme-grid" role="listbox" aria-label="Theme">
            {THEMES.map((t) => {
              const on = prefs.theme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  aria-label={`${t.label} theme`}
                  onClick={() => setTheme(t.id)}
                  className={on ? "theme-option is-on" : "theme-option"}
                >
                  <i className="swatch" data-swatch={t.id} />
                  <span>
                    <b>{t.label}</b>
                    <small>{t.feel}</small>
                  </span>
                  {on ? <Check size={16} /> : null}
                </button>
              );
            })}
          </div>
          {rows.map((row) => (
            <label key={row.key} className="flex items-center justify-between gap-4 rounded-lg bg-cine-surface px-3 py-3">
              <span>
                <b className="block font-ui text-sm">{row.label}</b>
                <small className="text-cine-faint">{row.hint}</small>
              </span>
              <input
                type="checkbox"
                checked={prefs[row.key]}
                onChange={(e) => patchPrefs({ [row.key]: e.target.checked })}
                className="size-5 accent-cine-cyan"
              />
            </label>
          ))}
          <HouseRemote />
          <InstallCinevo />
        </div>
        <div className="mt-6 rounded-lg border border-cine-danger/40 bg-cine-surface px-3 py-3">
          <b className="block font-ui text-sm">Local data</b>
          <p className="mt-1 text-xs text-cine-faint">
            This clears watch progress, My List, indexed titles, Plex sign-in, and Node pairing on this device.
          </p>
          <button
            type="button"
            className={`mt-3 h-11 w-full rounded-md font-ui font-bold ${
              confirmClear ? "bg-cine-danger text-cine-text" : "border border-cine-danger text-cine-danger"
            }`}
            onClick={() => {
              if (!confirmClear) {
                setConfirmClear(true);
                return;
              }
              clearLocalData();
              setConfirmClear(false);
              setSettingsOpen(false);
            }}
          >
            {confirmClear ? "Tap again to clear everything" : "Clear all local data"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function CoreModal() {
  const open = useCinevo((s) => s.coreOpen);
  const tab = useCinevo((s) => s.coreTab);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const setCoreTab = useCinevo((s) => s.setCoreTab);
  const sources = useCinevo((s) => s.sources);
  const aiConsent = useCinevo((s) => s.aiConsent);
  const setAiConsent = useCinevo((s) => s.setAiConsent);
  const flash = useCinevo((s) => s.flash);
  const play = useCinevo((s) => s.play);
  const setTheme = useCinevo((s) => s.setTheme);
  const patchPrefs = useCinevo((s) => s.patchPrefs);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [plan, setPlan] = useState<PremierePlan | null>(null);
  const [pending, setPending] = useState(false);
  const [profile, setProfile] = useState<{ username: string; xp: number; streak: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    void getMyProfile()
      .then((res) => {
        if (res.ok && res.profile) setProfile(res.profile);
      })
      .catch(() => undefined);
  }, [open]);
  const ask = async (seed?: string) => {
    const next = (seed ?? question).trim();
    if (!next || pending) return;
    if (seed) setQuestion(seed);
    setPending(true);
    try {
      const pool = libraryPool();
      const progress = useCinevo.getState().progress;
      const favorites = new Set(useCinevo.getState().favorites);
      const res = await askCinevo({
        data: {
          question: next,
          titles: pool.map((t) => ({
            id: t.id,
            title: t.title,
            year: t.year,
            kind: t.kind,
            genre: t.genre,
            rating: t.rating,
            synopsis: t.synopsis,
            runtime: t.runtime,
            progress: progress[t.id] ?? 0,
            favorite: favorites.has(t.id),
          })),
        },
      });
      if (res.ok) {
        setAnswer(res.text.replace(/\*\*/g, ""));
        setPlan(res.plan);
      } else flash(res.error);
    } finally {
      setPending(false);
    }
  };
  const takeSeat = (next: PremierePlan) => {
    setTheme(next.theme);
    patchPrefs({
      nightMode: true,
      zenMode: true,
      focusMode: true,
      mix: next.mix || mixForTheme(next.theme),
      ambience: true,
      denoise: next.denoise !== false,
    });
    useCinevo.setState({ tonight: next.queueIds.slice(0, 8) });
    play(next.playId);
    setCoreOpen(false);
  };
  if (!open) return null;
  if (tab === "ai") {
    return (
      <div className="house-page house-page--flow">
        <button type="button" className="house-back" onClick={() => setCoreOpen(false)}>
          <ChevronLeft size={16} /> Back
        </button>
        <section className="max-w-xl" aria-label="Ask CINEVO">
          <header className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="font-ui text-xs font-semibold tracking-[0.14em] text-cine-cyan">LA PREMIÈRE</p>
              <h2 className="font-ui text-2xl font-semibold tracking-tight">The attendant</h2>
            </div>
            <button type="button" aria-label="Close Ask" className="top-nav__icon" onClick={() => setCoreOpen(false)}>
              <X size={18} />
            </button>
          </header>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <span>
              <b className="block font-ui text-sm">Private metadata assistance</b>
              <small className="text-cine-faint">Only titles already in this house</small>
            </span>
            <input
              type="checkbox"
              checked={aiConsent}
              onChange={(e) => setAiConsent(e.target.checked)}
              className="size-5 accent-cine-cyan"
            />
          </label>
          {aiConsent ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                {AI_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className="h-11 rounded-full border border-white/10 bg-white/5 px-4 font-ui text-sm"
                    onClick={() => void ask(p.q)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={400}
                placeholder="A premiere, a short sitting, or a title by name."
                className="h-28 w-full rounded-2xl border border-white/10 bg-black/30 p-3 font-ui"
              />
              <button
                type="button"
                onClick={() => void ask()}
                disabled={pending}
                className="house-btn house-btn--play h-11"
              >
                {pending ? "Preparing the house…" : "Ask the attendant"}
              </button>
              {answer ? <p className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-cine-muted">{answer}</p> : null}
              {plan?.steps?.length ? (
                <ol className="space-y-1 text-sm text-cine-faint">
                  {plan.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
              {plan ? (
                <button type="button" className="house-btn h-11 w-full" onClick={() => takeSeat(plan)}>
                  Take your seat
                </button>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-sm text-cine-faint">Turn consent on to ask about titles in this house. Nothing leaves until you do.</p>
          )}
        </section>
      </div>
    );
  }
  const points =
    (sources.length ? 1 : 0) +
    (profile ? 1 : 0) +
    (aiConsent ? 1 : 0);

  return (
    <div className="house-page house-page--flow">
      <button type="button" className="house-back" onClick={() => setCoreOpen(false)}>
        <ChevronLeft size={16} /> Back
      </button>
      <section className="max-w-3xl" aria-label="Core">
        <header className="mb-4 flex items-start justify-between">
          <div>
            <p className="font-ui text-xs font-semibold tracking-[0.12em] text-cine-cyan">CINEVO CORE</p>
            <h2 className="font-ui text-xl font-semibold tracking-tight">Your media. Your rules.</h2>
          </div>
          <button type="button" aria-label="Close Core" onClick={() => setCoreOpen(false)}>
            <X size={18} />
          </button>
        </header>
        <nav className="mb-5 flex flex-wrap gap-2">
          {(["libraries", "sharing", "stewardship"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setCoreTab(t)}
              className={`h-11 rounded-full px-4 font-ui text-sm font-semibold ${
                tab === t ? "bg-cine-cyan text-cine-bg" : "bg-cine-surface text-cine-muted"
              }`}
            >
              {t === "libraries" ? "Libraries" : t === "sharing" ? "Sharing" : "Privacy"}
            </button>
          ))}
        </nav>
        {tab === "libraries" && (
          <div className="space-y-6">
            <p className="text-sm text-cine-muted">
              {sources.length
                ? `${sources.length} source${sources.length === 1 ? "" : "s"} connected.`
                : "No sources yet. Folders scan in the browser. Sign in with Plex from Library. Jellyfin uses CINEVO Node."}
            </p>
            {sources.length ? (
              <ul className="space-y-2">
                {sources.map((s) => (
                  <li key={s.id} className="rounded-lg bg-cine-surface px-3 py-3 font-ui text-sm">
                    <b className="capitalize">{s.name}</b>
                    <span className="ml-2 font-mono text-xs text-cine-faint">
                      {s.kind} · {s.count}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="h-11 rounded-md bg-cine-cyan px-5 font-ui font-bold text-cine-bg"
              onClick={() => {
                setCoreOpen(false);
                useCinevo.getState().setRoom("sidebar");
              }}
            >
              Open Library
            </button>
            <div>
              <p className="font-ui text-xs font-semibold tracking-[0.1em] text-cine-cyan">NODE INSTALLERS</p>
              <p className="mt-1 mb-3 text-sm text-cine-muted">
                Needed for Jellyfin and disk paths on the computer that holds the files. Plex signs in here. Folder pick works in this browser.
              </p>
              <InstallerCards />
              <Link
                to="/node"
                className="mt-3 inline-flex h-11 items-center font-ui text-sm font-bold text-cine-cyan"
                onClick={() => setCoreOpen(false)}
              >
                Open pairing
              </Link>
            </div>
          </div>
        )}
        {tab === "sharing" && <SharePanel />}
        {tab === "stewardship" && (
          <div>
            <p className="font-mono text-4xl text-cine-cyan">{points}</p>
            <p className="font-ui text-sm text-cine-muted">stewardship points — for care, not watch-time.</p>
            {profile ? (
              <p className="mt-3 font-ui text-sm text-cine-text">
                @{profile.username} · {profile.xp} XP · {profile.streak} night streak
              </p>
            ) : (
              <p className="mt-3 text-sm text-cine-faint">Claim a username to start a streak and share libraries.</p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: "Private index", done: sources.length > 0 },
                { label: "Username ready", done: Boolean(profile) },
                { label: "AI consent", done: aiConsent },
                { label: "Library care", done: sources.length > 0 },
              ].map((item) => (
                <article key={item.label} className="rounded-lg border border-cine-border bg-cine-surface p-3">
                  <b className="font-ui text-sm">{item.label}</b>
                  <p className="text-xs text-cine-faint">{item.done ? "Complete" : "Open"}</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

export function NoticesOverlay() {
  const open = useCinevo((s) => s.noticesOpen);
  const setNoticesOpen = useCinevo((s) => s.setNoticesOpen);
  const notices = useCinevo((s) => s.notices);
  const markNoticeRead = useCinevo((s) => s.markNoticeRead);
  const markAllNoticesRead = useCinevo((s) => s.markAllNoticesRead);
  const dismissNotice = useCinevo((s) => s.dismissNotice);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const setRoom = useCinevo((s) => s.setRoom);
  if (!open) return null;
  return (
    <div className="house-page house-page--flow">
      <button type="button" className="house-back" onClick={() => setNoticesOpen(false)}>
        <ChevronLeft size={16} /> Back
      </button>
      <section className="max-w-lg" aria-label="Notices">
        <header className="mb-4 flex items-start justify-between">
          <div>
            <p className="font-ui text-xs font-semibold tracking-[0.12em] text-cine-cyan">HOUSE NOTES</p>
            <h2 className="font-ui text-lg font-semibold tracking-tight">Notices</h2>
          </div>
          <button type="button" aria-label="Close notices" onClick={() => setNoticesOpen(false)}>
            <X size={18} />
          </button>
        </header>
        {notices.length ? (
          <div className="mb-3 flex justify-end">
            <button type="button" className="font-ui text-xs text-cine-cyan" onClick={markAllNoticesRead}>
              Mark all read
            </button>
          </div>
        ) : (
          <p className="text-sm text-cine-faint">Nothing waiting. Library changes and sharing land here.</p>
        )}
        <ul className="space-y-2">
          {notices.map((n) => (
            <li key={n.id} className={`rounded-lg px-3 py-3 ${n.readAt ? "bg-cine-well" : "bg-cine-surface"}`}>
              <button
                type="button"
                className="w-full text-left"
                onClick={() => {
                  markNoticeRead(n.id);
                  if (n.href?.includes("core=sharing")) setCoreOpen(true, "sharing");
                  else if (n.href?.includes("core=libraries")) {
                    setCoreOpen(false);
                    setRoom("sidebar");
                  } else if (n.href?.includes("core=ai")) setCoreOpen(true, "ai");
                  setNoticesOpen(false);
                }}
              >
                <b className="block font-ui text-sm">{n.title}</b>
                <p className="mt-1 text-xs text-cine-muted">{n.message}</p>
              </button>
              <button
                type="button"
                className="mt-2 font-ui text-xs text-cine-faint hover:text-cine-danger"
                onClick={() => dismissNotice(n.id)}
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function Toast() {
  const toast = useCinevo((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-full border border-cine-cyan bg-cine-elevated px-4 py-2 font-ui text-sm tracking-wide">
      {toast}
    </div>
  );
}

export type { Title };
