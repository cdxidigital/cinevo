import { Clock3, ChevronLeft, Library, Play, Plus, Server, Settings2, Share2, Shuffle, Sparkles, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  MOODS,
  byMood,
  filterCatalog,
  genresIn,
  pickFeatured,
  recentlyAdded,
  type Title,
} from "@/lib/catalog";
import { titleById, useCinevo, type Room, type SourceFilter } from "@/lib/cinevo-store";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { mostPlayed, tasteFrom } from "@/lib/house-tools";
import { isLoopbackUrl } from "@/lib/playback-urls";
import { useLibrary } from "@/lib/use-library";
import { findFolder, mapFolderNetwork, titlesInFolder } from "@/lib/folder-map";
import { episodeLabel, episodeMark, onDeck, organizeLibrary, type PlexShow } from "@/lib/plex-shelf";
import { HouseCard } from "./onboarding";
import { Rail, ArtImage, LibraryBoard } from "./poster";
import { AddLibrary } from "./add-library";
import { ToolsRoom } from "./tools-room";
import { BrandKicker } from "./logo";

const SOURCES: [SourceFilter, string][] = [
  ["all", "All"],
  ["folder", "Folders"],
  ["plex", "Plex"],
  ["jellyfin", "Jellyfin"],
  ["shared", "Shared"],
];

function houseLink(sources: { kind: string; baseUrl?: string }[], nodeUrl: string, nodeToken: string) {
  const relay = sources.some((s) => (s.kind === "plex" || s.kind === "jellyfin") && s.baseUrl && !isLoopbackUrl(s.baseUrl));
  if (relay) return { mode: "relay" as const, label: "Remote server", detail: "Playback stays on the server you connected." };
  const local =
    sources.some((s) => s.kind === "folder" || isLoopbackUrl(s.baseUrl)) || Boolean(nodeToken && isLoopbackUrl(nodeUrl));
  if (local) return { mode: "local" as const, label: "On this device", detail: "Folders and local servers stay in this house." };
  return { mode: "idle" as const, label: "Nothing connected", detail: "Add a library when you are ready." };
}

function OsDeck({
  watching,
  collections,
  added,
  link,
  onWatch,
  onCollections,
  onAdded,
  onLink,
}: {
  watching: number;
  collections: number;
  added: number;
  link: { mode: "local" | "relay" | "idle"; label: string };
  onWatch: () => void;
  onCollections: () => void;
  onAdded: () => void;
  onLink: () => void;
}) {
  const tiles = [
    { icon: Play, title: "Continue watching", detail: watching ? `${watching} in progress` : "Nothing mid-watch", onClick: onWatch },
    { icon: Library, title: "My collections", detail: collections === 1 ? "1 shelf" : collections ? `${collections} shelves` : "No shelves yet", onClick: onCollections },
    { icon: Clock3, title: "Recently added", detail: added ? `${added} new titles` : "Waiting for a library", onClick: onAdded },
    { icon: Server, title: link.label, detail: link.mode === "idle" ? "Connect a source" : "Ready to play", onClick: onLink },
  ];
  return (
    <div className="os-deck">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <button key={tile.title} type="button" className="os-tile" onClick={tile.onClick}>
            <span className="os-tile__icon" aria-hidden="true">
              <Icon size={16} />
            </span>
            <span>
              <b>{tile.title}</b>
              <small>{tile.detail}</small>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function OsDock({
  link,
  libraries,
  continueWatching,
  onPlay,
  onOpen,
  onAdd,
  onAsk,
  onShare,
  onSettings,
}: {
  link: { mode: "local" | "relay" | "idle"; label: string; detail: string };
  libraries: number;
  continueWatching: Title[];
  onPlay: (id: string) => void;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onAsk: () => void;
  onShare: () => void;
  onSettings: () => void;
}) {
  const actions = [
    { icon: Plus, label: "Add library", onClick: onAdd },
    { icon: Sparkles, label: "Ask this house", onClick: onAsk },
    { icon: Share2, label: "Sharing", onClick: onShare },
    { icon: Settings2, label: "Settings", onClick: onSettings },
  ];
  return (
    <aside className="os-dock" aria-label="House status">
      <section className="os-card">
        <header>
          <span className="net-dot" data-mode={link.mode} aria-hidden="true" />
          Server
        </header>
        <b>{link.label}</b>
        <small>{libraries ? `${libraries} ${libraries === 1 ? "library" : "libraries"}` : link.detail}</small>
      </section>
      <section className="os-card">
        <header>Now in progress</header>
        {continueWatching.length ? (
          <ul className="os-now">
            {continueWatching.slice(0, 3).map((title) => (
              <li key={title.id}>
                <button type="button" onClick={() => onOpen(title.id)}>
                  <ArtImage src={title.still || title.poster} fallback="/stills/neon-alley.jpg" className="os-now__art" />
                  <span>
                    <b>{title.title}</b>
                    <small>{title.runtime}</small>
                  </span>
                </button>
                <button type="button" className="os-now__play" aria-label={`Play ${title.title}`} onClick={() => onPlay(title.id)}>
                  <Play size={12} fill="currentColor" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <small>Start a title and it stays here.</small>
        )}
      </section>
      <section className="os-card">
        <header>Quick actions</header>
        <div className="os-actions">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.label} type="button" onClick={action.onClick}>
                <Icon size={15} />
                {action.label}
              </button>
            );
          })}
        </div>
      </section>
    </aside>
  );
}

function HeroActions({
  onPlay,
  playLabel,
  onMore,
  moreLabel = "More info",
  extra,
  playIcon = true,
}: {
  onPlay: () => void;
  playLabel: string;
  onMore: () => void;
  moreLabel?: string;
  extra?: React.ReactNode;
  playIcon?: boolean;
}) {
  return (
    <div className="house-actions">
      <button type="button" onClick={onPlay} className="house-btn house-btn--play">
        {playIcon ? <Play size={16} fill="currentColor" /> : null} {playLabel}
      </button>
      <button type="button" onClick={onMore} className="house-btn house-btn--ghost">
        {moreLabel}
      </button>
      {extra}
    </div>
  );
}

function PlatformArc({ quiet = false }: { quiet?: boolean }) {
  const setRoom = useCinevo((s) => s.setRoom);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const cards = [
    {
      title: "Private libraries",
      copy: "Folders on this computer, Plex, or Jellyfin. Node for disk paths on another machine.",
      action: "Open",
      onClick: () => setRoom("sidebar"),
    },
    {
      title: "Friend sharing",
      copy: "Invite by username. Share Plex and Jellyfin catalogs — playback stays on the original server.",
      action: "Share",
      onClick: () => setCoreOpen(true, "sharing"),
    },
    {
      title: "Library care",
      copy: "Stewardship for the collection. No watch-time scores. No social pressure.",
      action: "Review",
      onClick: () => setCoreOpen(true, "stewardship"),
    },
    {
      title: "Consent-led AI",
      copy: "Ask the titles already in this house. Nothing leaves until you opt in.",
      action: "Ask",
      onClick: () => setCoreOpen(true, "ai"),
    },
  ];
  return (
    <section className="platform-arc">
      <header>
        <h2>{quiet ? "Also in this house" : "Start with a library you control."}</h2>
        {quiet ? null : (
          <p>Folders, Plex, or Jellyfin. Nothing is added until you choose it. Playback stays on servers you own.</p>
        )}
      </header>
      <div className="platform-arc__grid">
        {cards.map((card) => (
          <button key={card.title} type="button" className="arc-card" onClick={card.onClick}>
            <b>{card.title}</b>
            <span>{card.copy}</span>
            <i>{card.action}</i>
          </button>
        ))}
      </div>
    </section>
  );
}

function FolderNetwork({
  titles,
  extras,
  value,
  onChange,
}: {
  titles: { id: string; source?: string; sourceLabel?: string; path?: string; folder?: string }[];
  extras: { sourceLabel: string; folders?: string[] }[];
  value: string;
  onChange: (path: string) => void;
}) {
  const trees = useMemo(() => mapFolderNetwork(titles, extras), [titles, extras]);
  if (!trees.length) return null;
  const crumbs = value.split("/").filter(Boolean);
  const current = value ? findFolder(trees, value) : null;
  const nodes = current ? current.children : trees;
  return (
    <div className="folder-network" aria-label="Folder network">
      <div className="house-sources" role="tablist" aria-label="Folder path">
        <button type="button" className={value ? "house-chip" : "house-chip is-on"} onClick={() => onChange("")}>
          All folders
        </button>
        {crumbs.map((crumb, index) => {
          const path = crumbs.slice(0, index + 1).join("/");
          return (
            <button key={path} type="button" className={path === value ? "house-chip is-on" : "house-chip"} onClick={() => onChange(path)}>
              {crumb}
            </button>
          );
        })}
      </div>
      {nodes.length ? (
        <div className="house-sources" role="list" aria-label="Folders here">
          {nodes.map((node) => (
            <button key={node.path} type="button" className="house-chip" onClick={() => onChange(node.path)}>
              {node.name}
              <span className="folder-network__count">{node.count || node.children.length}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StageRoom() {
  const play = useCinevo((s) => s.play);
  const openTitle = useCinevo((s) => s.openTitle);
  const progress = useCinevo((s) => s.progress);
  const favorites = useCinevo((s) => s.favorites);
  const tonight = useCinevo((s) => s.tonight);
  const mood = useCinevo((s) => s.mood);
  const shufflePlay = useCinevo((s) => s.shufflePlay);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const setSettingsOpen = useCinevo((s) => s.setSettingsOpen);
  const setRoom = useCinevo((s) => s.setRoom);
  const sourceFilter = useCinevo((s) => s.sourceFilter);
  const setSourceFilter = useCinevo((s) => s.setSourceFilter);
  const setMood = useCinevo((s) => s.setMood);
  const sources = useCinevo((s) => s.sources);
  const nodeUrl = useCinevo((s) => s.nodeUrl);
  const nodeToken = useCinevo((s) => s.nodeToken);
  const plays = useCinevo((s) => s.plays);
  const collections = useCinevo((s) => s.collections);
  const hydrated = useCinevo((s) => s.hydrated);
  const library = useLibrary();
  const [folder, setFolder] = useState("");
  const visible = useMemo(() => titlesInFolder(library, folder), [library, folder]);
  const person = useCurrentUser();
  const hour = new Date().getHours();
  const hello =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const rawName = person && !person.isDevFallback ? person.displayName?.split(" ")[0] : "";
  const who = rawName && !rawName.includes("@") && !/\d{4,}/.test(rawName) ? rawName : "";

  const pool = byMood(mood, visible);
  const hero = pickFeatured({ mood, progress, tonight, pool: visible.length ? visible : library });
  const heroProgress = hero ? progress[hero.id] ?? 0 : 0;
  const continueWatching = visible.filter((t) => {
    const p = progress[t.id];
    return p != null && p > 0 && p < 100;
  });
  const shelf = useMemo(() => organizeLibrary(visible), [visible]);
  const deck = useMemo(() => onDeck(shelf.shows, progress), [shelf.shows, progress]);
  const addedMovies = recentlyAdded(12, byMood(mood, shelf.movies));
  const addedTv = recentlyAdded(12, shelf.shows.flatMap((show) => show.episodes));
  const addedIds = new Set(addedMovies.map((t) => t.id));
  const myList = visible.filter((t) => favorites.includes(t.id));
  const taste = useMemo(() => tasteFrom(visible, favorites, progress), [visible, favorites, progress]);
  const suggestions = useMemo(() => {
    const base = pool.filter((t) => !favorites.includes(t.id) && !addedIds.has(t.id));
    if (!taste.length) return base.slice(0, 12);
    const weight = new Map(taste.map((item) => [item.genre, item.count]));
    const score = (title: Title) =>
      (title.genres?.length ? title.genres : [title.genre]).reduce((n, genre) => n + (weight.get(genre) ?? 0), 0);
    return [...base].sort((a, b) => score(b) - score(a)).slice(0, 12);
  }, [pool, favorites, addedIds, taste]);
  const played = useMemo(() => mostPlayed(visible, plays, 10).map((row) => row.title), [visible, plays]);
  const queued = tonight
    .map((id) => titleById(id))
    .filter((t): t is Title => Boolean(t));

  const still = hero?.still || "/stills/neon-alley.jpg";
  const link = houseLink(sources, nodeUrl, nodeToken);

  return (
    <div className="house-home">
      <section className="house-hero" aria-labelledby="featured-title">
        <ArtImage src={still} fallback="/stills/neon-alley.jpg" className="house-hero__art" />
        <div className="house-hero__shade" />
        <div className="house-hero__copy">
          <p className="house-hello">{who ? `${hello}, ${who}` : hello}</p>
          {hero ? (
            <p className="house-kicker">{hero.kind === "series" ? "Series" : "Film"}</p>
          ) : (
            <BrandKicker>Private by design</BrandKicker>
          )}
          <h1 id="featured-title">{hero ? hero.title : "Your media. Your moment."}</h1>
          {hero ? (
            <>
              <p className="house-meta">
                <span>{hero.year}</span>
                <i />
                <span>{hero.runtime}</span>
                <i />
                <span>{hero.genre}</span>
                {hero.rating > 0 ? (
                  <>
                    <i />
                    <span>
                      <Star size={12} className="inline text-cine-amber" fill="currentColor" /> {hero.rating.toFixed(1)}
                    </span>
                  </>
                ) : null}
              </p>
              <p className="lede lede--clamp">{hero.synopsis}</p>
              <HeroActions
                onPlay={() => play(hero.id)}
                playLabel={heroProgress > 0 && heroProgress < 100 ? "Resume" : "Play"}
                onMore={() => openTitle(hero.id)}
                extra={
                  <button type="button" onClick={shufflePlay} className="house-btn house-btn--ghost">
                    <Shuffle size={16} /> Surprise me
                  </button>
                }
              />
            </>
          ) : (
            <>
              <p className="lede">
                {hydrated
                  ? "Connect Plex, Jellyfin, a folder on this computer, or Node. Your titles appear here — nothing is published, and nothing is filled in for you."
                  : "Opening your house…"}
              </p>
              {hydrated ? (
                <HeroActions
                  onPlay={() => setRoom("sidebar")}
                  playLabel="Add library"
                  playIcon={false}
                  onMore={() => setCoreOpen(true, "libraries")}
                  moreLabel="Open Core"
                />
              ) : (
                <div className="mt-8 h-11 w-48 animate-pulse rounded-md bg-cine-surface" />
              )}
            </>
          )}
        </div>
      </section>

      <div className="os-body">
        <div className="house-stage">
          {library.length ? (
            <>
              <div className="house-filters">
                {sources.length > 1 ? (
                  <div className="house-sources" role="tablist" aria-label="Sources">
                    {SOURCES.map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={sourceFilter === id}
                        onClick={() => setSourceFilter(id)}
                        className={sourceFilter === id ? "house-chip is-on" : "house-chip"}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="house-sources" role="tablist" aria-label="Mood">
                  {MOODS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      aria-selected={mood === m.id}
                      onClick={() => setMood(m.id)}
                      className={mood === m.id ? "house-chip is-on" : "house-chip"}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <FolderNetwork
                  titles={library}
                  extras={sources.map((source) => ({ sourceLabel: source.name, folders: source.folders }))}
                  value={folder}
                  onChange={setFolder}
                />
              </div>

              <div className="house-library">
                <HouseCard />
                <OsDeck
                  watching={continueWatching.length}
                  collections={collections.length}
                  added={addedMovies.length}
                  link={link}
                  onWatch={() => (continueWatching[0] ? play(continueWatching[0].id) : setRoom("movies"))}
                  onCollections={() => setRoom("movies")}
                  onAdded={() => setRoom("movies")}
                  onLink={() => setRoom("sidebar")}
                />
                <div className="house-rails">
                  {continueWatching.length ? <Rail heading="Continue watching" titles={continueWatching} wide /> : null}
                  {deck.length ? <Rail heading="On deck" titles={deck} wide /> : null}
                  {queued.length ? <Rail heading="Up next" titles={queued} wide /> : null}
                  {played.length ? <Rail heading="Most played here" titles={played} /> : null}
                  {addedMovies.length ? <Rail heading="Recently added movies" titles={addedMovies} /> : null}
                  {addedTv.length ? <Rail heading="Recently added TV" titles={addedTv} /> : null}
                  {suggestions.length ? <Rail heading="For you" titles={suggestions} /> : null}
                  {myList.length ? <Rail heading="My List" titles={myList} /> : null}
                  {collections.map((collection) => {
                    const titles = collection.titleIds
                      .map((id) => library.find((title) => title.id === id))
                      .filter((title): title is NonNullable<typeof title> => Boolean(title));
                    if (!titles.length) return null;
                    return <Rail key={collection.id} heading={collection.name} titles={titles} />;
                  })}
                </div>
                <PlatformArc quiet />
              </div>
            </>
          ) : (
            <div className="house-library">
              <HouseCard />
              <PlatformArc />
            </div>
          )}
        </div>
        {library.length ? (
          <OsDock
            link={link}
            libraries={sources.length}
            continueWatching={continueWatching}
            onPlay={play}
            onOpen={openTitle}
            onAdd={() => setRoom("sidebar")}
            onAsk={() => setCoreOpen(true, "ai")}
            onShare={() => setCoreOpen(true, "sharing")}
            onSettings={() => setSettingsOpen(true)}
          />
        ) : null}
      </div>
    </div>
  );
}

function ShowWall({ shows, onOpen }: { shows: PlexShow[]; onOpen: (id: string) => void }) {
  const play = useCinevo((s) => s.play);
  const progress = useCinevo((s) => s.progress);
  if (!shows.length) return null;
  return (
    <div className="poster-grid">
      {shows.map((show) => {
        const next = onDeck([show], progress)[0] || show.episodes[0];
        return (
          <article key={show.id} className="poster">
            <div className="poster-frame">
              <button type="button" className="block w-full" aria-label={`Open ${show.title}`} onClick={() => onOpen(show.id)}>
                {show.poster ? (
                  <img src={show.poster} alt="" className="aspect-2/3 w-full object-cover" />
                ) : (
                  <span className="poster-fallback">{show.title}</span>
                )}
              </button>
              <button
                type="button"
                className="poster-play"
                aria-label={`Play ${show.title}`}
                onClick={() => (next ? play(next.id) : undefined)}
              >
                <Play size={16} fill="currentColor" />
              </button>
            </div>
            <div className="poster-meta">
              <button type="button" className="min-w-0 text-left" onClick={() => onOpen(show.id)}>
                <h3>{show.title}</h3>
                <p>
                  {show.seasons.length} {show.seasons.length === 1 ? "season" : "seasons"} · {show.episodes.length} episodes
                </p>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SeasonBrowser({ show, onBack }: { show: PlexShow; onBack: () => void }) {
  const play = useCinevo((s) => s.play);
  const openTitle = useCinevo((s) => s.openTitle);
  const progress = useCinevo((s) => s.progress);
  return (
    <div className="show-seasons">
      <button type="button" className="house-back" onClick={onBack}>
        <ChevronLeft size={16} /> Shows
      </button>
      <header className="mt-4">
        <h2>{show.title}</h2>
        <p className="lede">
          {show.year !== "—" ? `${show.year} · ` : ""}
          {show.seasons.length} {show.seasons.length === 1 ? "season" : "seasons"} · {show.episodes.length} episodes
        </p>
      </header>
      {show.seasons.map((season) => (
        <section key={season.season} className="mt-8">
          <h3 className="rail-heading">Season {season.season}</h3>
          <div className="library-list">
            {season.episodes.map((episode) => {
              const mark = episodeMark(episode);
              const seen = progress[episode.id];
              return (
                <article key={episode.id} className="library-row">
                  <button type="button" className="library-row__open" onClick={() => openTitle(episode.id)}>
                    <span>
                      <h3>{mark ? episodeLabel(mark) : episode.title}</h3>
                      <p>{[episode.runtime, episode.genre].filter(Boolean).join(" · ")}</p>
                      {seen != null && seen > 0 ? (
                        <i className="library-progress">
                          <b style={{ width: `${Math.min(100, seen)}%` }} />
                        </i>
                      ) : null}
                    </span>
                  </button>
                  <button type="button" className="house-btn house-btn--play" onClick={() => play(episode.id)}>
                    <Play size={14} fill="currentColor" /> Play
                  </button>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export function BrowseRoom({ kind: initialKind = "all" }: { kind?: "all" | "movie" | "series" }) {
  const [kind, setKind] = useState<"all" | "movie" | "series">(initialKind);
  const [genre, setGenre] = useState("All");
  const [folder, setFolder] = useState("");
  const [showId, setShowId] = useState<string | null>(null);
  const sources = useCinevo((s) => s.sources);
  useEffect(() => {
    setKind(initialKind);
    setGenre("All");
    setShowId(null);
  }, [initialKind]);
  const library = useLibrary();
  const scoped = useMemo(() => titlesInFolder(filterCatalog({ genre, pool: library }), folder), [genre, library, folder]);
  const shelf = useMemo(() => organizeLibrary(scoped), [scoped]);
  useEffect(() => {
    setShowId(null);
  }, [folder, genre, kind]);
  const show = shelf.shows.find((item) => item.id === showId) || null;
  const genres = genresIn(library);
  const heading = initialKind === "movie" ? "Movies" : initialKind === "series" ? "TV Shows" : "Library";
  const empty = !shelf.movies.length && !shelf.shows.length;
  return (
    <div className="house-page library-os">
      <header>
        <BrandKicker>CINEVO library</BrandKicker>
        <h1>{heading}</h1>
        <p className="lede">Movies stay one poster. A show opens into seasons and episodes.</p>
      </header>
      <div className="command-strip">
        <div className="house-sources" role="tablist" aria-label="Kind">
          {(["all", "movie", "series"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={kind === k ? "house-chip is-on" : "house-chip"}
            >
              {k === "all" ? "All" : k === "movie" ? "Movies" : "TV Shows"}
            </button>
          ))}
        </div>
        {genres.length > 1 ? (
          <div className="house-sources" role="tablist" aria-label="Genre">
            {genres.map((g) => (
              <button
                key={g}
                type="button"
                role="tab"
                aria-selected={genre === g}
                onClick={() => setGenre(g)}
                className={genre === g ? "house-chip is-on" : "house-chip"}
              >
                {g}
              </button>
            ))}
          </div>
        ) : null}
        <FolderNetwork
          titles={library}
          extras={sources.map((source) => ({ sourceLabel: source.name, folders: source.folders }))}
          value={folder}
          onChange={setFolder}
        />
      </div>
      {show && kind !== "movie" ? (
        <SeasonBrowser show={show} onBack={() => setShowId(null)} />
      ) : (
        <>
          {empty ? <p className="library-empty">No titles yet. Import a library from Plex, Jellyfin, a folder, or Node.</p> : null}
          {kind !== "series" && shelf.movies.length ? (
            <section>
              {kind === "all" ? <h2 className="rail-heading">Movies</h2> : null}
              <LibraryBoard titles={shelf.movies} />
            </section>
          ) : null}
          {kind !== "movie" && shelf.shows.length ? (
            <section className={kind === "all" ? "mt-10" : undefined}>
              {kind === "all" ? <h2 className="rail-heading">TV Shows</h2> : null}
              <ShowWall shows={shelf.shows} onOpen={setShowId} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

export function SidebarRoom() {
  const local = useCinevo((s) => s.localTitles);
  const remote = useCinevo((s) => s.remoteTitles);
  const yours = [...local, ...remote];
  return (
    <div className="house-page house-page--flow">
      <header>
        <BrandKicker>CINEVO · Add sources</BrandKicker>
        <h1>Add sources</h1>
        <p className="lede">
          Folders scan in this browser. Sign in with Plex or Jellyfin to index and proxy playback. Pair Node for disk
          paths on another computer.
        </p>
      </header>
      <AddLibrary />
      {yours.length ? (
        <div className="mt-10">
          <h2 className="rail-heading">In your library</h2>
          <LibraryBoard titles={yours} />
        </div>
      ) : null}
    </div>
  );
}

export function RoomSwitch({ room }: { room: Room }) {
  switch (room) {
    case "browse":
      return <BrowseRoom />;
    case "movies":
      return <BrowseRoom kind="movie" />;
    case "shows":
      return <BrowseRoom kind="series" />;
    case "sidebar":
      return <SidebarRoom />;
    case "tools":
      return <ToolsRoom />;
    default:
      return <StageRoom />;
  }
}
