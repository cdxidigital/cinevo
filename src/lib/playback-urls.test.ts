import assert from "node:assert/strict";
import test from "node:test";
import {
  isLoopbackUrl,
  jellyfinStreamTarget,
  nodeStreamTarget,
  plexStreamTarget,
  serverAddressError,
} from "./playback-urls.ts";

test("plex playback is a CINEVO-side stream, not direct play", () => {
  const target = plexStreamTarget("https://plex.example:32400/", "plex-99", "secret-token", "client-1");
  const url = new URL(target.url);
  assert.equal(url.pathname, "/video/:/transcode/universal/start.mp4");
  assert.equal(url.searchParams.get("directPlay"), "0");
  assert.equal(url.searchParams.get("directStream"), "1");
  assert.equal(url.searchParams.get("videoQuality"), "99");
  assert.equal(url.searchParams.get("maxVideoBitrate"), "200000");
  assert.equal(url.searchParams.get("location"), "wan");
  assert.equal(url.searchParams.get("videoCodec"), null);
  assert.equal(url.searchParams.get("path"), "/library/metadata/99");
  assert.equal(url.searchParams.get("X-Plex-Client-Profile-Name"), "CINEVO");
  assert.equal(url.searchParams.get("X-Plex-Token"), "secret-token");
  assert.equal(target.headers["X-Plex-Token"], "secret-token");
  assert.equal(target.url.includes("/api/stream"), false);
});

test("jellyfin playback keeps the key on the server URL", () => {
  const target = jellyfinStreamTarget("http://jellyfin.example:8096", "jellyfin-abc", "jf-secret", "client-1");
  const url = new URL(target.url);
  assert.equal(url.pathname, "/Videos/abc/stream.mp4");
  assert.equal(url.searchParams.get("static"), "true");
  assert.equal(url.searchParams.get("MaxStreamingBitrate"), "200000000");
  assert.equal(url.searchParams.get("api_key"), "jf-secret");
  assert.match(target.headers.Authorization, /Token="jf-secret"/);
});

test("node playback does not put the pairing token in the URL", () => {
  const target = nodeStreamTarget("http://nas.local:48184", "pair-token", "/media/film.mkv", "title-1");
  const url = new URL(target.url);
  assert.equal(url.pathname, "/v1/play");
  assert.equal(url.searchParams.get("token"), null);
  assert.equal(url.searchParams.get("path"), "/media/film.mkv");
  assert.equal(url.searchParams.get("fit"), null);
  assert.equal(target.headers.Authorization, "Bearer pair-token");
  const copy = new URL(nodeStreamTarget("http://nas.local:48184", "pair-token", "/media/film.mkv", "title-1", "compatible").url);
  assert.equal(copy.searchParams.get("fit"), "compatible");
  assert.equal(copy.searchParams.get("token"), null);
});

test("loopback and blocked addresses", () => {
  assert.equal(isLoopbackUrl("http://127.0.0.1:48184"), true);
  assert.equal(isLoopbackUrl("https://plex.example:32400"), false);
  assert.equal(serverAddressError("file:///etc/passwd"), "That server address is not allowed.");
  assert.equal(serverAddressError("http://169.254.169.254/"), "That server address is not allowed.");
  assert.equal(serverAddressError("http://192.168.1.20:32400"), null);
  const local = new URL(plexStreamTarget("http://192.168.1.20:32400", "12", "token", "client").url);
  assert.equal(local.searchParams.get("location"), "lan");
});

test("a failed browser play can ask the server for an H.264 copy", () => {
  const target = plexStreamTarget("https://plex.example:32400/", "plex-99", "secret-token", "client-1", "compatible");
  const plex = new URL(target.url);
  assert.equal(plex.searchParams.get("directPlay"), "0");
  assert.equal(plex.searchParams.get("directStream"), "0");
  assert.equal(plex.searchParams.get("videoCodec"), "h264");
  assert.equal(plex.searchParams.get("audioCodec"), "aac");
  assert.equal(plex.searchParams.get("container"), "mp4");
  assert.match(target.headers["X-Plex-Client-Profile-Extra"] || "", /add-transcode-target/);
  assert.match(plex.searchParams.get("X-Plex-Client-Profile-Extra") || "", /container=mp4/);
  assert.equal(plex.searchParams.get("maxVideoBitrate"), "12000");
  assert.equal(plex.searchParams.get("subtitles"), "none");
  assert.equal(plex.searchParams.get("videoResolution"), null);

  const jellyfin = new URL(
    jellyfinStreamTarget("http://jellyfin.example:8096", "jellyfin-abc", "jf-secret", "client-1", "compatible").url,
  );
  assert.equal(jellyfin.searchParams.get("static"), "false");
  assert.equal(jellyfin.searchParams.get("VideoCodec"), "h264");
  assert.equal(jellyfin.searchParams.get("AudioCodec"), "aac");
  assert.equal(jellyfin.searchParams.get("TranscodingContainer"), "mp4");
  assert.equal(jellyfin.searchParams.get("AllowVideoStreamCopy"), "false");
  assert.equal(jellyfin.searchParams.get("MaxStreamingBitrate"), "12000000");
});
