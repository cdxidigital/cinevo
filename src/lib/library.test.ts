import assert from "node:assert/strict";
import test from "node:test";
import { applySourceFilter, isVideoFile, migrateTheme, parseFilename, scanFileList, sourceForTitle } from "./library.ts";
import type { LibraryTitle, LibSource } from "./library.ts";

test("folder scan keeps nested episodes instead of stopping at 80", () => {
  const files = Array.from({ length: 90 }, (_, i) => {
    const season = String(Math.floor(i / 10) + 1).padStart(2, "0");
    const ep = String((i % 10) + 1).padStart(2, "0");
    const name = i < 10 ? `Episode ${ep}.mkv` : `Show S${season}E${ep}.mkv`;
    const file = new File([new Uint8Array(8)], name);
    Object.defineProperty(file, "webkitRelativePath", { value: `Show/Season ${season}/${name}` });
    return file;
  });
  const titles = scanFileList(files, "Show");
  assert.equal(titles.length, 90);
  assert.equal(titles.every((title) => title.kind === "series"), true);
  assert.equal(new Set(titles.map((title) => title.id)).size, 90);
  assert.equal(titles[0].title, "Show · S01E01");
  assert.equal(titles[10].title, "Show · S02E01");
  const ordered = titles.map((title) => title.title).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  assert.ok(ordered.indexOf("Show · S01E02") < ordered.indexOf("Show · S01E10"));
});

test("parseFilename reads title and year", () => {
  assert.equal(parseFilename("Blade Runner (1982).mkv").title, "Blade Runner");
  assert.equal(parseFilename("Blade Runner (1982).mkv").year, "1982");
  assert.equal(parseFilename("The.Matrix.1999.1080p.BluRay.x264.mp4").title.includes("Matrix"), true);
  assert.equal(parseFilename("The.Matrix.1999.1080p.BluRay.x264.mp4").year, "1999");
  assert.equal(isVideoFile("foo.mp4"), true);
  assert.equal(isVideoFile("notes.txt"), false);
});

test("migrateTheme maps legacy ids", () => {
  assert.equal(migrateTheme("nova"), "harbor");
  assert.equal(migrateTheme("pulse"), "harbor");
  assert.equal(migrateTheme("noir"), "ink");
  assert.equal(migrateTheme("iris"), "day");
  assert.equal(migrateTheme("paper"), "day");
  assert.equal(migrateTheme("sage"), "grove");
  assert.equal(migrateTheme("ember"), "ember");
  assert.equal(migrateTheme("unknown"), "harbor");
});

function stub(id: string, source: LibraryTitle["source"]): LibraryTitle {
  return {
    id,
    title: id,
    kind: "movie",
    year: "2024",
    runtime: "90m",
    genre: "Drama",
    genres: ["Drama"],
    synopsis: "",
    cast: [],
    director: "",
    rating: 0,
    addedAt: "2024-01-01",
    poster: "",
    still: "",
    accent: "cyan",
    source,
    sourceLabel: source,
  };
}

test("applySourceFilter isolates shared catalogs", () => {
  const local = [stub("f1", "folder")];
  const remote = [stub("p1", "plex"), stub("j1", "jellyfin"), stub("s1", "shared")];
  assert.equal(applySourceFilter("all", local, remote).length, 4);
  assert.deepEqual(
    applySourceFilter("shared", local, remote).map((t) => t.id),
    ["s1"],
  );
  assert.deepEqual(
    applySourceFilter("folder", local, remote).map((t) => t.id),
    ["f1"],
  );
  assert.deepEqual(
    applySourceFilter("plex", local, remote).map((t) => t.id),
    ["p1"],
  );
});

test("sourceForTitle matches label and kind", () => {
  const sources: LibSource[] = [
    { id: "plex-1", kind: "plex", name: "Living Room", selected: true, count: 1 },
    { id: "jf-1", kind: "jellyfin", name: "james", selected: true, count: 1 },
  ];
  assert.equal(sourceForTitle({ source: "plex", sourceLabel: "Living Room" }, sources)?.id, "plex-1");
  assert.equal(sourceForTitle({ source: "jellyfin", sourceLabel: "james · Movies" }, sources)?.id, "jf-1");
  assert.equal(sourceForTitle({ source: "folder", sourceLabel: "Living Room" }, sources), undefined);
});
