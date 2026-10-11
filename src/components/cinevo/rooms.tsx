import { Cast, ChevronLeft, Clock3, Folder, Library, Play, Search, Server, Shuffle, Star, X } from "lucide-react";
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
import { titleById, useCinevo, progressBands, type LibrarySort, type Room, type SourceFilter } from "@/lib/cinevo-store";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { mostPlayed, tasteFrom } from "@/lib/house-tools";
import { isLoopbackUrl } from "@/lib/playback-urls";
import { useLibrary } from "@/lib/use-library";
import { findFolder, folderOf, mapFolderNetwork, titlesInFolder, type FolderBranch } from "@/lib/folder-map";
import { isGenericArt } from "@/lib/library";
import { episodeLabel, episodeMark, onDeck, organizeLibrary, sortShows, type PlexShow } from "@/lib/plex-shelf";
import { HouseCard, Onboarding } from "./onboarding";
import { openCast } from "./cast-sheet";
import { Rail, ArtImage, CoverImg, LibraryBoard, SeenBar } from "./poster";
import { AddLibrary } from "./add-library";
import { ToolsRoom } from "./tools-room";
import { BrandKicker } from "./logo";
import { CoreModal, Detail, NoticesOverlay, SearchOverlay, SettingsModal } from "./overlays";

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
              <Folder size={14} />
              {node.name}
              <span className="folder-network__count">{node.count || node.children.length}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function branchIds(node: FolderBranch): string[] {
  return [...node.titleIds, ...node.children.flatMap(branchIds)];
}

function postersFor(node: FolderBranch, titles: Title[]) {
  const wanted = new Set(branchIds(node));
  const found: string[] = [];
  for (const title of titles) {
    if (!wanted.has(title.id)) continue;
    const art = !isGenericArt(title.showPoster) ? title.showPoster : !isGenericArt(title.poster) ? title.poster : "";
    if (!art || found.includes(art)) continue;
    found.push(art);
    if (found.length === 4) break;
  }
  return found;
}

function FolderPosters({ sources }: { sources: string[] }) {
  const [broken, setBroken] = useState<string[]>([]);
  const live = sources.filter((src) => !broken.includes(src));
  return (
    <span className={`folder-card__art is-${Math.min(live.length, 4) || 0}`}>
      {live.length ? (
        live.map((src) => (
          <img key={src} src={src} alt="" onError={() => setBroken((list) => (list.includes(src) ? list : [...list, src]))} />
        ))
      ) : (
        <Folder size={28} />
      )}
      <i className="folder-card__badge" aria-hidden="true">
        <Folder size={14} />
      </i>
    </span>
  );
}

function titlesHere(titles: Title[], path: string) {
  return titles.filter((title) => {
    const folder = folderOf(title);
    const full = folder ? `${title.sourceLabel || "Library"}/${folder}` : "";
    if (!path) return !folder;
    return full === path;
  });
}

function FolderBrowser({
  titles,
  extras,
  path,
  onOpen,
}: {
  titles: Title[];
  extras: { sourceLabel: string; folders?: string[] }[];
  path: string;
  onOpen: (path: string) => void;
}) {
  const trees = useMemo(() => mapFolderNetwork(titles, extras), [titles, extras]);
  const current = path ? findFolder(trees, path) : null;
  const nodes = current ? current.children : trees;
  const here = titlesHere(titles, path);
  const crumbs = path.split("/").filter(Boolean);
  if (!trees.length && !here.length) {
    return <p className="library-empty">No folders in this library yet. Titles will appear here once a scan records their path.</p>;
  }
  return (
    <div className="folder-view">
      <div className="house-sources" role="navigation" aria-label="Folder path">
        <button type="button" className={path ? "house-chip" : "house-chip is-on"} onClick={() => onOpen("")}>
          <Folder size={14} /> Folders
        </button>
        {crumbs.map((crumb, index) => {
          const next = crumbs.slice(0, index + 1).join("/");
          return (
            <button key={next} type="button" className={next === path ? "house-chip is-on" : "house-chip"} onClick={() => onOpen(next)}>
              {crumb}
            </button>
          );
        })}
      </div>
      {nodes.length ? (
        <div className="folder-grid">
          {nodes.map((node) => (
            <button key={node.path} type="button" className="folder-card" onClick={() => onOpen(node.path)}>
              <FolderPosters sources={postersFor(node, titles)} />
              <span className="folder-card__copy">
                <b>{node.name}</b>
                <small>
                  {node.count} {node.count === 1 ? "title" : "titles"}
                  {node.children.length ? ` · ${node.children.length} ${node.children.length === 1 ? "folder" : "folders"}` : ""}
                </small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {here.length ? <LibraryBoard titles={here} /> : null}
    </div>
  );
}

export function StageRoom() {
  const play = useCinevo((s) => s.play);
  const openTitle = useCinevo((s) => s.openTitle);
  const bands = useCinevo((s) => progressBands(s.progress));
  const progress = useMemo(() => useCinevo.getState().progress, [bands]);
  const favorites = useCinevo((s) => s.favorites);
  const tonight = useCinevo((s) => s.tonight);
  const mood = useCinevo((s) => s.mood);
  const shufflePlay = useCinevo((s) => s.shufflePlay);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
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
        <ArtImage src={still} fallback="/stills/neon-alley.jpg" className="house-hero__art" eager />
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
                  <>
                    <button type="button" onClick={shufflePlay} className="house-btn house-btn--ghost">
                      <Shuffle size={16} /> Surprise me
                    </button>
                    <button type="button" onClick={() => openCast({ titleId: hero.id })} className="house-btn house-btn--ghost">
                      <Cast size={16} /> Cast
                    </button>
                  </>
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
      </div>
    </div>
  );
}

function ShowWall({ shows, onOpen }: { shows: PlexShow[]; onOpen: (id: string) => void }) {
  const play = useCinevo((s) => s.play);
  const bands = useCinevo((s) => progressBands(s.progress));
  const progress = useMemo(() => useCinevo.getState().progress, [bands]);
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
                  <CoverImg title={show.title} poster={show.poster} className="aspect-2/3 w-full object-cover" />
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

function ShowFacts({ show }: { show: PlexShow }) {
  const sample = show.episodes;
  const first = (read: (title: Title) => string | undefined) =>
    sample.map(read).find((value) => value && value !== "—" && value !== show.sourceLabel) || "";
  const genres = [...new Set(sample.flatMap((episode) => episode.genres || []))].filter(
    (genre) => genre && genre !== "Plex" && genre !== "Jellyfin" && genre !== show.sourceLabel,
  );
  const cast = [...new Set(sample.flatMap((episode) => episode.cast || []))].slice(0, 6);
  const facts = [
    first((episode) => episode.studio) ? ["Studio", first((episode) => episode.studio)] : null,
    first((episode) => episode.contentRating) ? ["Rated", first((episode) => episode.contentRating)] : null,
    genres.length ? ["Genres", genres.slice(0, 4).join(", ")] : null,
    first((episode) => episode.director) ? ["Director", first((episode) => episode.director)] : null,
  ].filter((item): item is [string, string] => Boolean(item));
  if (!facts.length && !cast.length) return null;
  return (
    <div className="show-facts">
      {facts.length ? (
        <ul className="detail-facts">
          {facts.map(([label, value]) => (
            <li key={label}>
              <span>{label}</span>
              <b>{value}</b>
            </li>
          ))}
        </ul>
      ) : null}
      {cast.length ? <p>Cast · {cast.join(", ")}</p> : null}
    </div>
  );
}

function SeasonBrowser({ show, onBack }: { show: PlexShow; onBack: () => void }) {
  const play = useCinevo((s) => s.play);
  const openTitle = useCinevo((s) => s.openTitle);
  return (
    <div className="show-seasons">
      <button type="button" className="house-back" onClick={onBack}>
        <ChevronLeft size={16} /> Shows
      </button>
      <header className="show-head">
        <CoverImg title={show.title} poster={show.poster} className="show-head__poster" />
        <div>
          <h2>{show.title}</h2>
          <p className="lede">
            {show.year !== "—" ? `${show.year} · ` : ""}
            {show.seasons.length} {show.seasons.length === 1 ? "season" : "seasons"} · {show.episodes.length} episodes
          </p>
          <ShowFacts show={show} />
        </div>
      </header>
      {show.seasons.map((season) => (
        <section key={season.season} className="mt-8">
          <h3 className="rail-heading">Season {season.season}</h3>
          <div className="library-list">
            {season.episodes.map((episode) => {
              const mark = episodeMark(episode);
              return (
                <article key={episode.id} className="library-row">
                  <button type="button" className="library-row__open" onClick={() => openTitle(episode.id)}>
                    <CoverImg title={episode.title} poster={episode.poster} accent={episode.accent} className="library-thumb" />
                    <span>
                      <h3>{mark ? episodeLabel(mark) : episode.title}</h3>
                      <p>{[episode.runtime, episode.genre].filter(Boolean).join(" · ")}</p>
                      <SeenBar id={episode.id} />
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

function decadeOf(year: string) {
  const value = Number.parseInt(year, 10);
  if (!Number.isFinite(value) || value < 1900) return "";
  return `${Math.floor(value / 10) * 10}s`;
}

function unseen(id: string, progress: Record<string, number>) {
  return (progress[id] ?? 0) < 90;
}

function narrowShow(show: PlexShow, episodes: Title[]): PlexShow {
  const seasons = new Map<number, Title[]>();
  for (const episode of episodes) {
    const season = episodeMark(episode)?.season ?? 1;
    const list = seasons.get(season) || [];
    list.push(episode);
    seasons.set(season, list);
  }
  return {
    ...show,
    episodes,
    seasons: [...seasons.entries()].map(([season, rows]) => ({ season, episodes: rows })),
  };
}

export function BrowseRoom({ kind: initialKind = "all" }: { kind?: "all" | "movie" | "series" }) {
  const [kind, setKind] = useState<"all" | "movie" | "series" | "folders">(initialKind);
  const [genre, setGenre] = useState("All");
  const [folder, setFolder] = useState("");
  const [showId, setShowId] = useState<string | null>(null);
  const [unwatched, setUnwatched] = useState(false);
  const [decade, setDecade] = useState("All");
  const sources = useCinevo((s) => s.sources);
  const bands = useCinevo((s) => progressBands(s.progress));
  const progress = useMemo(() => useCinevo.getState().progress, [bands]);
  const query = useCinevo((s) => s.libraryQuery);
  const setLibraryQuery = useCinevo((s) => s.setLibraryQuery);
  const sort = useCinevo((s) => s.prefs.librarySort);
  const patchPrefs = useCinevo((s) => s.patchPrefs);
  useEffect(() => {
    setKind(initialKind);
    setGenre("All");
    setDecade("All");
    setShowId(null);
  }, [initialKind]);
  const library = useLibrary();
  const scoped = useMemo(() => titlesInFolder(filterCatalog({ genre, query, pool: library }), folder), [genre, query, library, folder]);
  const shelf = useMemo(() => organizeLibrary(scoped), [scoped]);
  const decades = useMemo(() => {
    const found = new Set<string>();
    for (const title of library) {
      const label = decadeOf(title.year);
      if (label) found.add(label);
    }
    return ["All", ...[...found].sort().reverse()];
  }, [library]);
  const movies = useMemo(() => {
    return shelf.movies.filter((title) => {
      if (decade !== "All" && decadeOf(title.year) !== decade) return false;
      if (unwatched && !unseen(title.id, progress)) return false;
      return true;
    });
  }, [shelf.movies, decade, unwatched, progress]);
  const shows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const next = shelf.shows.flatMap((show) => {
      let episodes = show.episodes;
      if (q && !show.title.toLowerCase().includes(q)) {
        episodes = episodes.filter((episode) => filterCatalog({ query: q, pool: [episode] }).length > 0);
      }
      if (decade !== "All") {
        const inDecade = decadeOf(show.year) === decade || episodes.some((episode) => decadeOf(episode.year) === decade);
        if (!inDecade) return [];
      }
      if (unwatched) episodes = episodes.filter((episode) => unseen(episode.id, progress));
      if (!episodes.length) return [];
      return [narrowShow(show, episodes)];
    });
    return sortShows(next, sort);
  }, [shelf.shows, query, decade, unwatched, progress, sort]);
  useEffect(() => {
    setShowId(null);
  }, [folder, genre, kind, query, decade, unwatched]);
  const show = shows.find((item) => item.id === showId) || null;
  const genres = genresIn(library);
  const heading = initialKind === "movie" ? "Movies" : initialKind === "series" ? "TV Shows" : "Library";
  const empty = !movies.length && !shows.length;
  return (
    <div className="house-page library-os">
      <header>
        <BrandKicker>CINEVO library</BrandKicker>
        <h1>{heading}</h1>
        <p className="lede">Search, filter, and sort the way a library does. Movies stay posters. A show opens into seasons.</p>
      </header>
      <label className="library-find">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setLibraryQuery(event.target.value)}
          placeholder="Search titles, people, years, folders, studios"
          aria-label="Search this library"
        />
        {query ? (
          <button type="button" aria-label="Clear search" onClick={() => setLibraryQuery("")}>
            <X size={16} />
          </button>
        ) : null}
      </label>
      <div className="command-strip">
        <div className="house-sources" role="tablist" aria-label="Kind">
          {(["all", "movie", "series", "folders"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={kind === k ? "house-chip is-on" : "house-chip"}
            >
              {k === "all" ? "All" : k === "movie" ? "Movies" : k === "series" ? "TV Shows" : "Folders"}
            </button>
          ))}
        </div>
        <label className="library-sort">
          <span>Sort</span>
          <select
            aria-label="Sort library"
            value={sort}
            onChange={(event) => patchPrefs({ librarySort: event.target.value as LibrarySort })}
          >
            <option value="title">Title</option>
            <option value="year">Year</option>
            <option value="added">Date added</option>
            <option value="rating">Rating</option>
            <option value="runtime">Duration</option>
          </select>
        </label>
        <div className="house-sources" role="tablist" aria-label="Watched">
          <button type="button" className={unwatched ? "house-chip is-on" : "house-chip"} aria-pressed={unwatched} onClick={() => setUnwatched((on) => !on)}>
            Unwatched
          </button>
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
        {decades.length > 2 ? (
          <div className="house-sources" role="tablist" aria-label="Decade">
            {decades.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={decade === item}
                onClick={() => setDecade(item)}
                className={decade === item ? "house-chip is-on" : "house-chip"}
              >
                {item === "All" ? "All years" : item}
              </button>
            ))}
          </div>
        ) : null}
        {kind === "folders" ? null : (
        <FolderNetwork
          titles={library}
          extras={sources.map((source) => ({ sourceLabel: source.name, folders: source.folders }))}
          value={folder}
          onChange={setFolder}
        />
        )}
      </div>
      {kind === "folders" ? (
        <FolderBrowser
          titles={library.filter((title) => {
            if (query.trim() && !filterCatalog({ query, pool: [title] }).length) return false;
            if (genre !== "All" && !(title.genres || []).includes(genre) && title.genre !== genre) return false;
            if (decade !== "All" && decadeOf(title.year) !== decade) return false;
            if (unwatched && !unseen(title.id, progress)) return false;
            return true;
          })}
          extras={sources.map((source) => ({ sourceLabel: source.name, folders: source.folders }))}
          path={folder}
          onOpen={setFolder}
        />
      ) : show && kind !== "movie" ? (
        <SeasonBrowser show={show} onBack={() => setShowId(null)} />
      ) : (
        <>
          {empty ? (
            <p className="library-empty">
              {library.length ? "Nothing matches this search." : "No titles yet. Import a library from Plex, Jellyfin, a folder, or Node."}
            </p>
          ) : null}
          {kind !== "series" && movies.length ? (
            <section>
              {kind === "all" ? <h2 className="rail-heading">Movies</h2> : null}
              <LibraryBoard titles={movies} toolbar={false} />
            </section>
          ) : null}
          {kind !== "movie" && shows.length ? (
            <section className={kind === "all" ? "mt-10" : undefined}>
              {kind === "all" ? <h2 className="rail-heading">TV Shows</h2> : null}
              <ShowWall shows={shows} onOpen={setShowId} />
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
  const page = useCinevo((s) =>
    s.selectedId
      ? "title"
      : s.searchOpen
        ? "search"
        : s.settingsOpen
          ? "settings"
          : s.noticesOpen
            ? "notices"
            : s.coreOpen
              ? "core"
              : "",
  );
  const onboarded = useCinevo((s) => s.house.onboarded);
  const hydrated = useCinevo((s) => s.hydrated);
  const playingId = useCinevo((s) => s.playingId);
  if (page === "title") return <Detail />;
  if (page === "search") return <SearchOverlay />;
  if (page === "settings") return <SettingsModal />;
  if (page === "notices") return <NoticesOverlay />;
  if (page === "core") return <CoreModal />;
  if (hydrated && !onboarded && !playingId) return <Onboarding />;
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
