import { useEffect, useMemo, useState } from "react";
import { MOODS } from "@/lib/catalog";
import { titleById, useCinevo } from "@/lib/cinevo-store";
import { clampNumber, duplicateGroups, mostPlayed, peopleIn, renamePreview, tasteFrom } from "@/lib/house-tools";
import { useLibrary } from "@/lib/use-library";
import { BrandKicker } from "./logo";
import { HouseRemote, InstallCinevo } from "./house-remote";
import { AddPasskey } from "./passkey-login";

export function ToolsRoom() {
  const library = useLibrary();
  const favorites = useCinevo((s) => s.favorites);
  const progress = useCinevo((s) => s.progress);
  const plays = useCinevo((s) => s.plays);
  const collections = useCinevo((s) => s.collections);
  const mood = useCinevo((s) => s.mood);
  const setMood = useCinevo((s) => s.setMood);
  const prefs = useCinevo((s) => s.prefs);
  const patchPrefs = useCinevo((s) => s.patchPrefs);
  const createCollection = useCinevo((s) => s.createCollection);
  const addToCollection = useCinevo((s) => s.addToCollection);
  const removeFromCollection = useCinevo((s) => s.removeFromCollection);
  const deleteCollection = useCinevo((s) => s.deleteCollection);
  const patchTitle = useCinevo((s) => s.patchTitle);
  const hideTitle = useCinevo((s) => s.hideTitle);
  const play = useCinevo((s) => s.play);
  const startParty = useCinevo((s) => s.startParty);
  const setCoreOpen = useCinevo((s) => s.setCoreOpen);
  const flash = useCinevo((s) => s.flash);
  const errors = useCinevo((s) => s.playbackErrors);
  const setSettingsOpen = useCinevo((s) => s.setSettingsOpen);
  const missing = library.filter((title) => !title.year || title.year === "—" || !title.synopsis);

  const [collectionName, setCollectionName] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [pickId, setPickId] = useState("");
  const [editId, setEditId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editYear, setEditYear] = useState("");
  const [editGenre, setEditGenre] = useState("");
  const [editSynopsis, setEditSynopsis] = useState("");
  const [pattern, setPattern] = useState("{title} ({year})");
  const [person, setPerson] = useState("");
  const [withName, setWithName] = useState("");
  const [partyId, setPartyId] = useState("");

  const taste = useMemo(() => tasteFrom(library, favorites, progress), [library, favorites, progress]);
  const dupes = useMemo(() => duplicateGroups(library), [library]);
  const played = useMemo(() => mostPlayed(library, plays, 6), [library, plays]);
  const people = useMemo(() => peopleIn(library, person), [library, person]);
  const previews = library.slice(0, 6).map((title) => ({ id: title.id, from: title.title, to: renamePreview(title, pattern) }));
  const selectedCollection = collections.find((collection) => collection.id === collectionId) ?? collections[0];

  const loadEdit = (id: string) => {
    setEditId(id);
    const title = titleById(id);
    setEditTitle(title?.title ?? "");
    setEditYear(title?.year ?? "");
    setEditGenre(title?.genre ?? "");
    setEditSynopsis(title?.synopsis ?? "");
  };

  return (
    <div className="house-page house-page--flow tools-room">
      <header>
        <BrandKicker>House tools</BrandKicker>
        <h1>Care for this library</h1>
        <p className="lede">
          These tools use titles you have already imported. Nothing here is a public catalog, a live channel, or a fake server graph.
        </p>
      </header>

      <section className="tool-card" aria-label="Library health">
        <h2>Library health</h2>
        {!library.length ? (
          <p>No titles yet. Connect a library, or enter Preview House from Home. Nothing is deleted from disk here.</p>
        ) : (
          <ul className="space-y-2 text-sm text-cine-muted">
            <li>{missing.length ? `${missing.length} titles are missing a year or a summary.` : "Metadata looks filled in."}</li>
            <li>{errors.length ? `${errors.length} titles failed to play or convert.` : "No playback failures recorded on this device."}</li>
            <li>{dupes.length ? `${dupes.length} possible duplicates (same title and year).` : "No obvious duplicates."}</li>
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="house-btn house-btn--ghost" onClick={() => setSettingsOpen(true)}>
            Open settings
          </button>
          {dupes[0] ? (
            <button type="button" className="house-btn house-btn--ghost" onClick={() => hideTitle(dupes[0][1].id)}>
              Hide one duplicate entry
            </button>
          ) : null}
        </div>
      </section>

      <div className="tools-grid">
      <HouseRemote />
      <AddPasskey />
      <InstallCinevo />
      <section className="tool-card">
        <h2>Taste in this house</h2>
        <p>Genres rise when you save a title or start watching it. Ask is on the left, and it only uses titles already in this house.</p>
        {taste.length ? (
          <ul className="tool-pills">
            {taste.map((item) => (
              <li key={item.genre}>
                {item.genre} <small>{item.count}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tool-empty">Save a title or press play to build a taste profile.</p>
        )}
        <div className="house-sources">
          {MOODS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={mood === item.id ? "house-chip is-on" : "house-chip"}
              onClick={() => setMood(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="tool-card">
        <h2>Most played here</h2>
        {played.length ? (
          <ol className="tool-list">
            {played.map((row) => (
              <li key={row.title.id}>
                <button type="button" onClick={() => play(row.title.id)}>
                  <b>{row.title.title}</b>
                  <small>
                    {row.count} play{row.count === 1 ? "" : "s"} · {row.title.year}
                  </small>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="tool-empty">Play a title and it will show up here. This is only your house, not a public chart.</p>
        )}
      </section>

      <section className="tool-card">
        <h2>Collections</h2>
        <form
          className="tool-row"
          onSubmit={(e) => {
            e.preventDefault();
            createCollection(collectionName);
            setCollectionName("");
          }}
        >
          <input
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="Collection name"
            aria-label="Collection name"
            maxLength={40}
          />
          <button type="submit" className="house-btn house-btn--play">
            Create
          </button>
        </form>
        {collections.length && library.length ? (
          <form
            className="tool-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!selectedCollection || !pickId) return;
              addToCollection(selectedCollection.id, pickId);
            }}
          >
            <select
              aria-label="Collection"
              value={selectedCollection?.id ?? ""}
              onChange={(e) => setCollectionId(e.target.value)}
            >
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
            <select aria-label="Title to add" value={pickId} onChange={(e) => setPickId(e.target.value)}>
              <option value="">Choose a title</option>
              {library.map((title) => (
                <option key={title.id} value={title.id}>
                  {title.title}
                </option>
              ))}
            </select>
            <button type="submit" className="house-btn house-btn--ghost">
              Add
            </button>
          </form>
        ) : null}
        {selectedCollection ? (
          <div>
            <div className="tool-row">
              <b>{selectedCollection.name}</b>
              <button type="button" className="house-btn house-btn--ghost" onClick={() => deleteCollection(selectedCollection.id)}>
                Delete
              </button>
            </div>
            <ul className="tool-list">
              {selectedCollection.titleIds.map((id) => {
                const title = titleById(id);
                if (!title) return null;
                return (
                  <li key={id}>
                    <button type="button" onClick={() => play(id)}>
                      <b>{title.title}</b>
                      <small>{title.year}</small>
                    </button>
                    <button type="button" onClick={() => removeFromCollection(selectedCollection.id, id)}>
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
            {!selectedCollection.titleIds.length ? <p className="tool-empty">This collection is empty.</p> : null}
          </div>
        ) : (
          <p className="tool-empty">Create a collection, then add titles you already have.</p>
        )}
      </section>

      <section className="tool-card">
        <h2>Duplicates</h2>
        <p>Same title and year, more than once, in the library you are viewing. Removing a copy only drops it from CINEVO.</p>
        {dupes.length ? (
          <ul className="tool-list">
            {dupes.map((group) => (
              <li key={group[0].id} className="tool-dupe">
                <div>
                  <b>
                    {group[0].title} · {group.length}
                  </b>
                  <ul>
                    {group.map((title) => (
                      <li key={title.id}>
                        <span>{title.sourceLabel || title.source}</span>
                        <button type="button" onClick={() => hideTitle(title.id)}>
                          Remove from house
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="tool-empty">{library.length ? "No duplicates in this view." : "Import a library to scan for duplicates."}</p>
        )}
      </section>

      <section className="tool-card">
        <h2>Edit details</h2>
        <p>Changes stay in CINEVO. They do not rewrite the file on disk or the Plex server.</p>
        <select
          aria-label="Title to edit"
          value={editId}
          onChange={(e) => loadEdit(e.target.value)}
        >
          <option value="">Choose a title</option>
          {library.map((title) => (
            <option key={title.id} value={title.id}>
              {title.title}
            </option>
          ))}
        </select>
        {editId ? (
          <form
            className="tool-stack"
            onSubmit={(e) => {
              e.preventDefault();
              patchTitle(editId, { title: editTitle, year: editYear, genre: editGenre, synopsis: editSynopsis });
            }}
          >
            <input aria-label="Title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={120} />
            <input aria-label="Year" value={editYear} onChange={(e) => setEditYear(e.target.value)} maxLength={8} />
            <input aria-label="Genre" value={editGenre} onChange={(e) => setEditGenre(e.target.value)} maxLength={40} />
            <textarea aria-label="Synopsis" value={editSynopsis} onChange={(e) => setEditSynopsis(e.target.value)} maxLength={500} />
            <button type="submit" className="house-btn house-btn--play">
              Save details
            </button>
          </form>
        ) : null}
      </section>

      <section className="tool-card">
        <h2>File name preview</h2>
        <p>Preview only. Use {"{title}"}, {"{year}"}, and {"{genre}"}. Files are not renamed.</p>
        <form
          className="tool-row"
          onSubmit={(e) => {
            e.preventDefault();
            const lines = library.slice(0, 40).map((title) => renamePreview(title, pattern)).join("\n");
            void navigator.clipboard?.writeText(lines).then(
              () => flash("Preview copied"),
              () => flash("Could not copy the preview"),
            );
          }}
        >
          <input aria-label="Name pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} maxLength={80} />
          <button type="submit" className="house-btn house-btn--ghost" disabled={!library.length}>
            Copy preview
          </button>
        </form>
        <ul className="tool-list">
          {previews.map((row) => (
            <li key={row.id}>
              <span>
                <b>{row.to || "—"}</b>
                <small>{row.from}</small>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tool-card">
        <h2>People in your files</h2>
        <input
          aria-label="Cast or director"
          value={person}
          onChange={(e) => setPerson(e.target.value)}
          placeholder="Director or cast name"
          maxLength={80}
        />
        {person.trim().length >= 2 ? (
          people.length ? (
            <ul className="tool-list">
              {people.map((title) => (
                <li key={title.id}>
                  <button type="button" onClick={() => play(title.id)}>
                    <b>{title.title}</b>
                    <small>{title.director || title.cast?.[0] || title.year}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="tool-empty">No matching credit in this library.</p>
          )
        ) : (
          <p className="tool-empty">Type at least two letters. Matches director and cast already on the title.</p>
        )}
      </section>

      <section className="tool-card">
        <h2>Playback care</h2>
        <label>
          Skip the first seconds
          <BoundedNumber
            label="Intro skip seconds"
            value={prefs.introSkip}
            min={0}
            max={180}
            onCommit={(introSkip) => patchPrefs({ introSkip })}
          />
        </label>
        <label>
          Subtitle offset in seconds
          <BoundedNumber
            label="Subtitle offset seconds"
            value={prefs.subtitleOffset}
            min={-15}
            max={15}
            step={0.5}
            onCommit={(subtitleOffset) => patchPrefs({ subtitleOffset })}
          />
        </label>
        <p>Intro skip runs when a file starts from the beginning. Subtitle offset shifts cues if the file actually has a text track.</p>
      </section>

      <section className="tool-card">
        <h2>Watch with someone</h2>
        <p>Starts playback here and remembers who you are watching with. It does not sync a remote player.</p>
        <form
          className="tool-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!partyId) {
              flash("Choose a title to start with");
              return;
            }
            startParty(partyId, withName);
          }}
        >
          <select aria-label="Title to watch" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">Choose a title</option>
            {library.map((title) => (
              <option key={title.id} value={title.id}>
                {title.title}
              </option>
            ))}
          </select>
          <input
            aria-label="Watching with"
            value={withName}
            onChange={(e) => setWithName(e.target.value)}
            placeholder="Name"
            maxLength={40}
          />
          <button type="submit" className="house-btn house-btn--play" disabled={!library.length}>
            Start
          </button>
        </form>
        <button type="button" className="house-btn house-btn--ghost" onClick={() => setCoreOpen(true, "sharing")}>
          Library permissions
        </button>
      </section>
      </div>
    </div>
  );
}

function BoundedNumber({
  label,
  value,
  min,
  max,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (raw: string) => {
    const next = clampNumber(raw, min, max, value);
    setDraft(String(next));
    if (next !== value) onCommit(next);
  };
  return (
    <input
      aria-label={label}
      type="number"
      min={min}
      max={max}
      step={step}
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit(e.currentTarget.value);
        }
      }}
    />
  );
}
