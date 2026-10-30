import assert from "node:assert/strict";
import test from "node:test";
import { isPlexHlsTicket, plexHlsUpstream, plexTicketSession, rewritePlexPlaylist } from "./plex-hls.ts";

const HOST = "https://203-0-113-9.abc.plex.direct:32400";
const TICKET = `${HOST}/video/:/transcode/universal/start.m3u8?session=s1&protocol=hls`;
const S = "/video/:/transcode/universal/session/s1";

test("only Plex HLS start URLs are treated as Plex HLS tickets", () => {
  assert.equal(isPlexHlsTicket(TICKET), true);
  assert.equal(isPlexHlsTicket("https://h:32400/video/:/transcode/universal/start.mp4?x=1"), false);
  assert.equal(isPlexHlsTicket("http://nas:48184/v1/play?path=/a.mkv"), false);
  assert.equal(isPlexHlsTicket("not a url"), false);
});

test("the ticket's session must be a plain id", () => {
  assert.equal(plexTicketSession(TICKET), "s1");
  assert.equal(plexTicketSession(`${HOST}/video/:/transcode/universal/start.m3u8`), null);
  assert.equal(plexTicketSession(`${HOST}/video/:/transcode/universal/start.m3u8?session=a/../b`), null);
});

test("the master and variant playlists point back at the ticket, with no token and no host", () => {
  const master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080\nsession/s1/base/index.m3u8?X-Plex-Token=leak\n";
  const out = rewritePlexPlaylist(master, TICKET, "t123", "s1");
  assert.ok(out);
  assert.match(out, /^#EXTM3U/);
  assert.ok(out.includes(`/api/stream/t123?hls=${encodeURIComponent(`${S}/base/index.m3u8`)}`));
  assert.equal(out.includes("leak"), false);
  assert.equal(out.includes("plex.direct"), false);

  const variantUrl = `${HOST}${S}/base/index.m3u8`;
  const variant = '#EXTM3U\n#EXT-X-MAP:URI="header"\n#EXTINF:4.0,\n00000.ts\n#EXTINF:4.0,\n00001.ts\n#EXT-X-ENDLIST\n';
  const v = rewritePlexPlaylist(variant, variantUrl, "t123", "s1");
  assert.ok(v);
  assert.ok(v.includes(`URI="/api/stream/t123?hls=${encodeURIComponent(`${S}/base/header`)}"`));
  assert.ok(v.includes(`/api/stream/t123?hls=${encodeURIComponent(`${S}/base/00001.ts`)}`));
  assert.ok(v.includes("#EXT-X-ENDLIST"));
});

test("a dropped segment takes its #EXTINF with it (no dangling tags)", () => {
  const body =
    "#EXTM3U\n#EXTINF:4,\nhttps://evil.example/x.ts\n#EXTINF:4,\n/library/metadata/1\n#EXTINF:4,\n/video/:/transcode/universal/session/OTHER/base/0.ts\n#EXTINF:4,\nsession/s1/base/00000.ts\n#EXT-X-ENDLIST\n";
  const out = rewritePlexPlaylist(body, TICKET, "t1", "s1");
  assert.ok(out);
  assert.equal(out.includes("evil.example"), false);
  assert.equal(out.includes("library"), false);
  assert.equal(out.includes("OTHER"), false);
  assert.equal(out.split("\n").filter((l) => l.startsWith("/api/stream/")).length, 1);
  assert.equal(out.split("\n").filter((l) => l.startsWith("#EXTINF")).length, 1);
  const lines = out.split("\n");
  assert.ok(lines[lines.indexOf("#EXTINF:4,") + 1].startsWith("/api/stream/t1"));
  assert.ok(out.includes("#EXT-X-ENDLIST"));
});

test("a dropped variant takes its #EXT-X-STREAM-INF with it", () => {
  const body = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttps://evil.example/v.m3u8\n";
  const out = rewritePlexPlaylist(body, TICKET, "t1", "s1");
  assert.equal(out?.includes("STREAM-INF"), false);
});

test("a tag naming a foreign URI refuses the whole playlist (Priya: KEY / MAP)", () => {
  for (const tag of ['#EXT-X-KEY:METHOD=AES-128,URI="https://evil.example/k"', '#EXT-X-MAP:URI="/library/x"', '#EXT-X-MEDIA:TYPE=AUDIO,URI="../OTHER/a.m3u8"']) {
    assert.equal(rewritePlexPlaylist(`#EXTM3U\n${tag}\n#EXTINF:4,\nsession/s1/base/0.ts\n`, TICKET, "t1", "s1"), null, tag);
  }
});

test("the token is stripped in any letter case (Priya: lowercase token)", () => {
  const body = "#EXTM3U\n#EXTINF:4,\nsession/s1/base/0.ts?x-plex-token=LEAK1&X-PLEX-TOKEN=LEAK2&X-Plex-Client-Identifier=c&keep=1\n";
  const out = rewritePlexPlaylist(body, TICKET, "t1", "s1");
  assert.ok(out);
  assert.equal(/leak/i.test(decodeURIComponent(out)), false);
  assert.equal(/x-plex/i.test(decodeURIComponent(out)), false);
  assert.ok(decodeURIComponent(out).includes("keep=1"));
  const up = plexHlsUpstream(TICKET, `${S}/base/0.ts?x-plex-token=a&X-PLEX-TOKEN=b&keep=1`);
  assert.equal(up, `${HOST}${S}/base/0.ts?keep=1`);
});

test("the proxy only follows paths inside this ticket's own session (Priya: any-session)", () => {
  assert.equal(plexHlsUpstream(TICKET, `${S}/base/00000.ts`), `${HOST}${S}/base/00000.ts`);
  assert.equal(plexHlsUpstream(TICKET, "/video/:/transcode/universal/session/s2/base/00000.ts"), null);
  assert.equal(plexHlsUpstream(TICKET, "/video/:/transcode/universal/session/s1x/base/00000.ts"), null);
  assert.equal(plexHlsUpstream(TICKET, "/video/:/transcode/universal/session/s1"), null);
  assert.equal(plexHlsUpstream(TICKET, "//evil.example/video/:/transcode/universal/session/s1/x"), null);
  assert.equal(plexHlsUpstream(TICKET, "https://evil.example/video/:/transcode/universal/session/s1/x"), null);
  assert.equal(plexHlsUpstream(TICKET, "/library/sections/1/all"), null);
  assert.equal(plexHlsUpstream(TICKET, "/video/:/transcode/universal/start.m3u8"), null);
  assert.equal(plexHlsUpstream(TICKET, ""), null);
  assert.equal(plexHlsUpstream(TICKET, `${S}/${"a".repeat(2000)}`), null);
  assert.equal(plexHlsUpstream(`${HOST}/video/:/transcode/universal/start.m3u8`, `${S}/base/0.ts`), null);
});

test("encoded and literal traversal is refused (Priya: %2f, %5c, %252e, double encoding)", () => {
  const escapes = [
    `${S}/../../../library/sections`,
    `${S}/./base/0.ts`,
    `${S}/%2e%2e/%2e%2e/%2e%2e/library/sections`,
    `${S}/..%2f..%2f..%2flibrary/sections`,
    `${S}/..%2F..%2Flibrary`,
    `${S}/..%5c..%5clibrary`,
    `${S}/%252e%252e/%252e%252e/library`,
    `${S}/%25252e%25252e/library`,
    `${S}\\..\\..\\library`,
    `${S}/base/0.ts\n/library`,
    `${S}/base/ 0.ts`,
  ];
  for (const rel of escapes) assert.equal(plexHlsUpstream(TICKET, rel), null, rel);
});

test("query smuggling can't change the host or path (Priya: query smuggling)", () => {
  const up = plexHlsUpstream(TICKET, `${S}/base/0.ts?u=https://evil.example/&path=/library#frag`);
  assert.ok(up);
  const url = new URL(up);
  assert.equal(url.origin, HOST);
  assert.equal(url.pathname, `${S}/base/0.ts`);
  assert.equal(plexHlsUpstream(TICKET, `?${S}/base/0.ts`), null);
  assert.equal(plexHlsUpstream(TICKET, `#${S}/base/0.ts`), null);
});

test("unquoted URI= and URI = with spaces are handled the way hls.js 1.7.3 parses them (Priya N8)", () => {
  for (const tag of [
    "#EXT-X-KEY:METHOD=AES-128,URI=https://evil.example/k",
    "#EXT-X-MAP:URI=https://evil.example/init.mp4",
    "#EXT-X-MAP:URI=header",
    '#EXT-X-KEY:METHOD=AES-128,URI ="https://evil.example/k"',
    '#EXT-X-MAP:URI = "https://evil.example/init.mp4"',
    "#ext-x-key:method=AES-128,uri = https://evil.example/k",
  ]) {
    assert.equal(rewritePlexPlaylist(`#EXTM3U\n${tag}\n#EXTINF:4,\nsession/s1/base/0.ts\n`, TICKET, "t1", "s1"), null, tag);
  }
  const ok = rewritePlexPlaylist('#EXTM3U\n#EXT-X-MAP:URI = "session/s1/base/header"\n#EXTINF:4,\nsession/s1/base/0.ts\n', TICKET, "t1", "s1");
  assert.ok(ok?.includes(`URI="/api/stream/t1?hls=${encodeURIComponent(`${S}/base/header`)}"`));
  assert.equal(ok?.includes("session/s1/base/header\""), false);
});
