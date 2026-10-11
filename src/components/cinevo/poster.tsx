import { Check, LayoutGrid, LayoutList, List, ListPlus, Play, Star } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Title } from "@/lib/catalog";
import { useCinevo, type LibrarySort, type LibraryView } from "@/lib/cinevo-store";
import { Mark } from "./logo";

export function ArtImage({
  src,
  fallback,
  className,
}: {
  src?: string;
  fallback: string;
  className?: string;
}) {
  const [current, setCurrent] = useState(src || fallback);
  useEffect(() => setCurrent(src || fallback), [src, fallback]);
  return (
    <img
      src={current}
      alt=""
      className={className}
      onError={() => {
        if (current !== fallback) setCurrent(fallback);
      }}
    />
  );
}

export function PosterCard({
  title,
  wide = false,
}: {
  title: Title;
  compact?: boolean;
  wide?: boolean;
}) {
  const progress = useCinevo((s) => s.progress[title.id]);
  const fav = useCinevo((s) => s.favorites.includes(title.id));
  const openTitle = useCinevo((s) => s.openTitle);
  const play = useCinevo((s) => s.play);
  const toggleFavorite = useCinevo((s) => s.toggleFavorite);
  const art = wide ? title.still || title.poster : title.poster;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [art]);

  return (
    <article className={cn("poster", wide && "poster--wide")}>
      <div className={cn("poster-frame", wide && "is-wide")}>
        <button type="button" onClick={() => openTitle(title.id)} aria-label={`Open ${title.title}`} className="block w-full">
          {art && !broken ? (
            <img
              src={art}
              alt=""
              className={cn("w-full object-cover", wide ? "aspect-video" : "aspect-2/3")}
              onError={() => setBroken(true)}
            />
          ) : (
            <span className={cn("poster-fallback", wide && "is-wide")}>{title.title}</span>
          )}
        </button>
        <span className="poster-shade" />
        <span className="poster-stamp">
          <Mark />
        </span>
        {progress != null && progress > 0 ? (
          <span className="poster-progress">
            <i style={{ width: `${progress}%` }} />
          </span>
        ) : null}
        <button
          type="button"
          aria-label={`Play ${title.title}`}
          onClick={() => play(title.id)}
          className="poster-play"
        >
          <Play size={16} fill="currentColor" />
        </button>
        {wide ? (
          <span className="poster-caption">
            <b>{title.title}</b>
            <small>
              {title.runtime}
              {progress != null && progress > 0 ? ` · ${Math.round(progress)}%` : ""}
            </small>
          </span>
        ) : null}
      </div>
      {wide ? null : (
        <div className="poster-meta">
          <button type="button" onClick={() => openTitle(title.id)} className="min-w-0 text-left">
            <h3>{title.title}</h3>
            <p>
              {title.rating > 0 ? (
                <>
                  <Star size={10} className="mr-1 inline" fill="currentColor" />
                  {title.rating.toFixed(1)} · {title.year}
                </>
              ) : (
                <>
                  {title.sourceLabel || title.source} · {title.year}
                </>
              )}
            </p>
          </button>
          <button
            type="button"
            aria-label={fav ? "Remove from My List" : "Add to My List"}
            className={cn("poster-list", fav && "is-on")}
            onClick={() => toggleFavorite(title.id)}
          >
            {fav ? <Check size={16} /> : <ListPlus size={16} />}
          </button>
        </div>
      )}
    </article>
  );
}

export function Rail({
  heading,
  titles,
  empty,
  wide = false,
}: {
  heading: string;
  titles: Title[];
  empty?: string;
  wide?: boolean;
}) {
  if (!titles.length) {
    if (!empty) return null;
    return (
      <section className="rail rail--empty">
        <h2 className="rail-heading">{heading}</h2>
        <p>{empty}</p>
      </section>
    );
  }
  return (
    <section className="rail">
      <header className="rail-head">
        <h2 className="rail-heading">{heading}</h2>
      </header>
      <div className={cn("rail-scroll", wide && "rail-scroll--wide")}>
        {titles.map((t) => (
          <div key={t.id} className={cn("rail-card", wide && "is-wide")}>
            <PosterCard title={t} wide={wide} />
          </div>
        ))}
      </div>
    </section>
  );
}

const VIEWS: { id: LibraryView; label: string; icon: typeof LayoutGrid }[] = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "list", label: "List", icon: List },
  { id: "hybrid", label: "Hybrid", icon: LayoutList },
];

const SORTS: { id: LibrarySort; label: string }[] = [
  { id: "title", label: "Title" },
  { id: "year", label: "Year" },
  { id: "added", label: "Added" },
];

function sortTitles(titles: Title[], sort: LibrarySort) {
  const copy = [...titles];
  const byTitle = (a: Title, b: Title) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" });
  if (sort === "year") copy.sort((a, b) => (b.year || "").localeCompare(a.year || "") || byTitle(a, b));
  else if (sort === "added") copy.sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || "") || byTitle(a, b));
  else copy.sort(byTitle);
  return copy;
}

function TitleActions({ title }: { title: Title }) {
  const play = useCinevo((s) => s.play);
  const fav = useCinevo((s) => s.favorites.includes(title.id));
  const toggleFavorite = useCinevo((s) => s.toggleFavorite);
  return (
    <span className="library-actions">
      <button type="button" aria-label={`Play ${title.title}`} onClick={() => play(title.id)}>
        <Play size={15} fill="currentColor" />
      </button>
      <button
        type="button"
        aria-label={fav ? "Remove from My List" : "Add to My List"}
        className={fav ? "is-on" : undefined}
        onClick={() => toggleFavorite(title.id)}
      >
        {fav ? <Check size={15} /> : <ListPlus size={15} />}
      </button>
    </span>
  );
}

function Thumb({ title, className }: { title: Title; className?: string }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [title.poster, title.id]);
  if (!title.poster || broken) {
    return <span className={cn("library-thumb library-thumb--empty", className)}>{title.title.slice(0, 1)}</span>;
  }
  return (
    <img
      src={title.poster}
      alt=""
      className={cn("library-thumb", className)}
      onError={() => setBroken(true)}
    />
  );
}

export function LibraryBoard({ titles, empty }: { titles: Title[]; empty?: string }) {
  const view = useCinevo((s) => s.prefs.libraryView);
  const sort = useCinevo((s) => s.prefs.librarySort);
  const patchPrefs = useCinevo((s) => s.patchPrefs);
  const openTitle = useCinevo((s) => s.openTitle);
  const progress = useCinevo((s) => s.progress);
  const ordered = useMemo(() => sortTitles(titles, sort), [titles, sort]);

  return (
    <div className="library-board">
      {titles.length ? (
        <div className="library-toolbar">
          <p>{titles.length === 1 ? "1 title" : `${titles.length} titles`}</p>
          <div className="library-toolbar__controls">
            <label className="library-sort">
              <span>Sort</span>
              <select
                aria-label="Sort library"
                value={sort}
                onChange={(event) => patchPrefs({ librarySort: event.target.value as LibrarySort })}
              >
                {SORTS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="library-views" role="group" aria-label="Library layout">
              {VIEWS.map((item) => {
                const Icon = item.icon;
                const on = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={on ? "is-on" : undefined}
                    aria-pressed={on}
                    onClick={() => patchPrefs({ libraryView: item.id })}
                  >
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {view === "grid" ? (
        <div className="poster-grid">
          {ordered.map((title) => (
            <PosterCard key={title.id} title={title} />
          ))}
        </div>
      ) : null}

      {view === "list" ? (
        <div className="library-list">
          {ordered.map((title) => {
            const seen = progress[title.id];
            return (
              <article key={title.id} className="library-row">
                <button type="button" className="library-row__open" onClick={() => openTitle(title.id)}>
                  <Thumb title={title} />
                  <span>
                    <h3>{title.title}</h3>
                    <p>
                      {[title.year, title.kind === "series" ? "Series" : "Movie", title.genre, title.sourceLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {seen != null && seen > 0 ? (
                      <i className="library-progress">
                        <b style={{ width: `${Math.min(100, seen)}%` }} />
                      </i>
                    ) : null}
                  </span>
                </button>
                <TitleActions title={title} />
              </article>
            );
          })}
        </div>
      ) : null}

      {view === "hybrid" ? (
        <div className="library-hybrid">
          {ordered.map((title) => {
            const seen = progress[title.id];
            return (
              <article key={title.id} className="library-card">
                <button type="button" aria-label={`Open ${title.title}`} onClick={() => openTitle(title.id)}>
                  <Thumb title={title} className="is-card" />
                </button>
                <div>
                  <button type="button" className="library-card__title" onClick={() => openTitle(title.id)}>
                    <h3>{title.title}</h3>
                  </button>
                  <p>
                    {[title.year, title.runtime, title.genre, title.sourceLabel].filter(Boolean).join(" · ")}
                    {title.rating > 0 ? ` · ${title.rating.toFixed(1)}` : ""}
                  </p>
                  {title.synopsis ? <p className="library-card__synopsis">{title.synopsis}</p> : null}
                  {seen != null && seen > 0 ? (
                    <i className="library-progress">
                      <b style={{ width: `${Math.min(100, seen)}%` }} />
                    </i>
                  ) : null}
                  <TitleActions title={title} />
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {!titles.length && empty ? <p className="library-empty">{empty}</p> : null}
    </div>
  );
}
