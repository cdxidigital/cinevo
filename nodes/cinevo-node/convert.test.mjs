import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { needsBrowserCopy, playlist, pickEncoder, ffmpegSegmentArgs, segmentCount } = require("./convert.cjs");

test("mkv needs a conversion and mp4 does not", () => {
  assert.equal(needsBrowserCopy("/media/Show/S01E01.mkv"), true);
  assert.equal(needsBrowserCopy("/media/film.mp4"), false);
  assert.equal(segmentCount(13), 3);
  assert.equal(segmentCount(0), 1);
});

test("the playlist is a short H.264 plan, not the original file", () => {
  const body = playlist({ filePath: "/media/a.mkv", id: "node-1", token: "", duration: 10 });
  assert.match(body, /#EXT-X-PLAYLIST-TYPE:VOD/);
  assert.match(body, /\/v1\/convert\?/);
  assert.match(body, /i=0/);
  assert.match(body, /i=1/);
  assert.equal(body.includes("token="), false);
  assert.equal(pickEncoder(" V....D libx264"), "libx264");
  assert.equal(pickEncoder(" V....D h264_videotoolbox\n V....D libx264"), "h264_videotoolbox");
  assert.equal(pickEncoder(""), "");
  const args = ffmpegSegmentArgs("/media/a.mkv", 2, "libx264", false);
  assert.equal(args[args.indexOf("-ss") + 1], "12");
  assert.equal(args.at(-1), "pipe:1");
  assert.ok(args.includes("libx264"));
});
