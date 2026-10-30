import assert from "node:assert/strict";
import test from "node:test";
import { isPlexHlsTicket, plexHlsUpstream, rewritePlexPlaylist } from "./plex-hls.ts";

const TICKET = "https://203-0-113-9.abc.plex.direct:32400/video/:/transcode/universal/start.m3u8?session=s1&protocol=hls";

test("only Plex HLS start URLs are treated as Plex HLS tickets", () => {
  assert.equal(isPlexHlsTicket(TICKET), true);
  assert.equal(isPlexHlsTicket("https://h:32400/video/:/transcode/universal/start.mp4?x=1"), false);
  assert.equal(isPlexHlsTicket("http://nas:48184/v1/play?path=/a.mkv"), false);
  assert.equal(isPlexHlsTicket("not a url"), false);
});

test("the master and variant playlists point back at the ticket, with no token and no host", () => {
  const master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\nsession/s1/base/index.m3u8?X-Plex-Token=leak\n";
  const out = rewritePlexPlaylist(master, TICKET, "t123");
  assert.match(out, /^#EXTM3U/);
  assert.ok(out.includes(`/api/stream/t123?hls=${encodeURIComponent("/video/:/transcode/universal/session/s1/base/index.m3u8")}`));
  assert.equal(out.includes("leak"), false);
  assert.equal(out.includes("plex.direct"), false);

  const variantUrl = "https://203-0-113-9.abc.plex.direct:32400/video/:/transcode/universal/session/s1/base/index.m3u8";
  const variant = '#EXTM3U\n#EXT-X-MAP:URI="header"\n#EXTINF:4.0,\n00000.ts\n#EXTINF:4.0,\n00001.ts\n#EXT-X-ENDLIST\n';
  const v = rewritePlexPlaylist(variant, variantUrl, "t123");
  assert.ok(v.includes(`URI="/api/stream/t123?hls=${encodeURIComponent("/video/:/transcode/universal/session/s1/base/header")}"`));
  assert.ok(v.includes(`/api/stream/t123?hls=${encodeURIComponent("/video/:/transcode/universal/session/s1/base/00001.ts")}`));
});

test("lines that leave the Plex host or the session tree are dropped", () => {
  const body = "#EXTM3U\n#EXTINF:4,\nhttps://evil.example/x.ts\n#EXTINF:4,\n/library/metadata/1\n#EXTINF:4,\nsession/s1/base/00000.ts\n";
  const out = rewritePlexPlaylist(body, TICKET, "t1");
  assert.equal(out.includes("evil.example"), false);
  assert.equal(out.includes("library"), false);
  assert.equal(out.split("\n").filter((l) => l.startsWith("/api/stream/")).length, 1);
});

test("the proxy only follows session paths on the ticket's own host", () => {
  assert.equal(
    plexHlsUpstream(TICKET, "/video/:/transcode/universal/session/s1/base/00000.ts"),
    "https://203-0-113-9.abc.plex.direct:32400/video/:/transcode/universal/session/s1/base/00000.ts",
  );
  assert.equal(plexHlsUpstream(TICKET, "//evil.example/video/:/transcode/universal/session/x"), null);
  assert.equal(plexHlsUpstream(TICKET, "https://evil.example/video/:/transcode/universal/session/x"), null);
  assert.equal(plexHlsUpstream(TICKET, "/library/sections/1/all"), null);
  assert.equal(plexHlsUpstream(TICKET, "/video/:/transcode/universal/session/../../../library/sections"), null);
  assert.equal(plexHlsUpstream(TICKET, "/video/:/transcode/universal/start.m3u8"), null);
  assert.equal(plexHlsUpstream(TICKET, ""), null);
  assert.equal(plexHlsUpstream(TICKET, `/video/:/transcode/universal/session/${"a".repeat(2000)}`), null);
  const stripped = plexHlsUpstream(TICKET, "/video/:/transcode/universal/session/s1/base/0.ts?X-Plex-Token=x&a=1");
  assert.equal(stripped?.includes("X-Plex-Token"), false);
  assert.equal(stripped?.includes("a=1"), true);
});
