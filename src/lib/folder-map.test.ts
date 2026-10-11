import assert from "node:assert/strict";
import test from "node:test";
import { findFolder, mapFolderNetwork, titlesInFolder } from "./folder-map.ts";

test("a server scan maps the folder network without dropping folders", () => {
  const tree = mapFolderNetwork(
    [
      { id: "a", source: "plex", sourceLabel: "NAS", path: "99", folder: "/volume1/media/Shows/Show/Season 01" },
      { id: "b", source: "plex", sourceLabel: "NAS", path: "100", folder: "/volume1/media/Shows/Show/Season 02" },
      { id: "c", source: "folder", sourceLabel: "Laptop", path: "Films/Heat (1995).mkv" },
    ],
    [{ sourceLabel: "NAS", folders: ["/volume1/media/Shows/Show/Season 03"] }],
  );
  const nas = tree.find((item) => item.name === "NAS");
  assert.ok(nas);
  assert.equal(nas.children[0].name, "volume1");
  const show = findFolder(tree, "NAS/volume1/media/Shows/Show");
  assert.deepEqual(
    show?.children.map((item) => item.name),
    ["Season 01", "Season 02", "Season 03"],
  );
  assert.deepEqual(titlesInFolder([{ id: "a", sourceLabel: "NAS", folder: "/volume1/media/Shows/Show/Season 01" }, { id: "c", source: "folder", sourceLabel: "Laptop", path: "Films/Heat (1995).mkv" }], "NAS/volume1/media/Shows/Show").map((item) => item.id), ["a"]);
});
