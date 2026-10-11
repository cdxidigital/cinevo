import assert from "node:assert/strict";
import test from "node:test";
import { convertSegmentUrl, needsBrowserCopy, rewriteConvertPlaylist } from "./convert.ts";

test("only odd containers need a CINEVO conversion", () => {
  assert.equal(needsBrowserCopy("/films/Heat.mkv"), true);
  assert.equal(needsBrowserCopy("Show\\Season 1\\Episode.ts"), true);
  assert.equal(needsBrowserCopy("trailer.mp4"), false);
  assert.equal(needsBrowserCopy("clip.webm"), false);
});

test("a node playlist is rewritten onto the playback ticket", () => {
  const body = ["#EXTM3U", "#EXTINF:6.000,", "/v1/convert?path=%2Fmedia%2Fa.mkv&i=0", "#EXTINF:2.000,", "/v1/convert?path=%2Fmedia%2Fa.mkv&i=1", "#EXT-X-ENDLIST"].join("\n");
  const next = rewriteConvertPlaylist(body, "ticket-1");
  assert.match(next, /\/api\/stream\/ticket-1\?seg=0/);
  assert.match(next, /\/api\/stream\/ticket-1\?seg=1/);
  assert.equal(next.includes("/v1/convert"), false);
  const segment = convertSegmentUrl("http://nas.local:48184/v1/play?path=%2Fmedia%2Fa.mkv&fit=compatible", "1");
  const url = new URL(segment);
  assert.equal(url.pathname, "/v1/convert");
  assert.equal(url.searchParams.get("i"), "1");
  assert.equal(url.searchParams.get("fit"), null);
  assert.equal(url.searchParams.get("path"), "/media/a.mkv");
});
