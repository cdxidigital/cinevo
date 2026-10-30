// Ports Priya's proxy-escape cases (scratch/priya-proxy-review) to the real suite.
// Fake servers on loopback; the guard trusts only the fake Plex host A and applies
// the production strict check to everything else.
import assert from "node:assert/strict";
import http from "node:http";
import test, { after } from "node:test";
import { fetchMedia, PLAYLIST_MAX_BYTES, sameHostRedirect, servePlexHls, strictGuard, UpstreamError, type AddressGuard } from "./media-proxy.server.ts";

const DUMMY = "dummy-token-not-real";
const servers: http.Server[] = [];
const seen: { host: string; url: string; gotToken?: boolean }[] = [];

function serve(handler: http.RequestListener) {
  return new Promise<number>((resolve) => {
    const s = http.createServer(handler);
    s.listen(0, "127.0.0.1", () => {
      servers.push(s);
      resolve((s.address() as { port: number }).port);
    });
  });
}
after(() => servers.forEach((s) => (s.closeAllConnections?.(), s.close())));

const portB = await serve((req, res) => {
  seen.push({ host: "B", url: req.url || "", gotToken: req.headers["x-plex-token"] === DUMMY });
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("internal-secret-from-B");
});
const B = `http://127.0.0.1:${portB}`;
const START = "/video/:/transcode/universal/start.m3u8";
const S = "/video/:/transcode/universal/session/s1";

const portA = await serve((req, res) => {
  const u = req.url || "";
  seen.push({ host: "A", url: u, gotToken: req.headers["x-plex-token"] === DUMMY });
  if (u.startsWith(START) && u.includes("redir=1")) return res.writeHead(302, { location: `${B}/anything/at/all` }).end();
  if (u.startsWith(START) && u.includes("mapped=1")) return res.writeHead(302, { location: `http://[::ffff:127.0.0.3]:${portB}/mapped` }).end();
  if (u.startsWith(START) && u.includes("meta=1")) return res.writeHead(302, { location: "http://169.254.170.2/v2/credentials" }).end();
  if (u.startsWith(START) && u.includes("hang=1")) return; // never answers
  if (u.startsWith(START) && u.includes("big=1")) {
    res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
    return res.end(`#EXTM3U\n${"#EXT-X-COMMENT:x\n".repeat(PLAYLIST_MAX_BYTES / 16 + 10)}`);
  }
  if (u.startsWith(START) && u.includes("same=1")) return res.writeHead(302, { location: `${S}/base/index.m3u8` }).end();
  if (u.startsWith(START) || u.startsWith(`${S}/base/index.m3u8`)) {
    res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
    return res.end(`#EXTM3U\n#EXTINF:4,\nhttps://evil.example/a.ts\n#EXTINF:4,\n${S}/base/0.ts?x-plex-token=${DUMMY}\n`);
  }
  if (u.includes("/session/s1/redir.ts")) return res.writeHead(302, { location: `${B}/internal/admin` }).end();
  if (u.includes("/evil.html")) return res.writeHead(200, { "content-type": "text/html" }).end("<script>alert(document.domain)</script>");
  if (u.includes("/session/")) return res.writeHead(200, { "content-type": "video/mp2t" }).end("seg");
  res.writeHead(404).end();
});
const A = `http://127.0.0.1:${portA}`;

const strict = strictGuard();
const testGuard: AddressGuard = async (url) => (new URL(url).host === new URL(A).host ? null : strict(url));
const ticket = (extra = "") => ({ url: `${A}${START}?session=s1${extra}`, headers: { "X-Plex-Token": DUMMY } });
const tokenReachedB = () => seen.some((s) => s.host === "B" && s.gotToken);
const hitB = () => seen.some((s) => s.host === "B");

test("a cross-host redirect from the ticket host is refused and the token never leaves (Priya: redirect escape)", async () => {
  const res = await servePlexHls(ticket("&redir=1"), "t", null, testGuard);
  assert.equal(res.status, 403);
  assert.equal(hitB(), false);
  assert.equal(tokenReachedB(), false);
});

test("a segment redirect to another host is refused, never served (Priya: segment redirect body)", async () => {
  const res = await servePlexHls(ticket(), "t", `${S}/redir.ts`, testGuard);
  assert.equal(res.status, 403);
  assert.equal((await res.text()).includes("internal-secret"), false);
  assert.equal(hitB(), false);
});

test("IPv4-mapped IPv6 loopback and link-local redirects are refused (Priya: mapped v6)", async () => {
  for (const extra of ["&mapped=1", "&meta=1"]) {
    const res = await servePlexHls(ticket(extra), "t", null, testGuard);
    assert.equal(res.status, 403, extra);
  }
  assert.equal(hitB(), false);
});

test("same-host redirects are still followed and re-checked", async () => {
  const res = await servePlexHls(ticket("&same=1"), "t", null, testGuard);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "application/vnd.apple.mpegurl");
});

test("fetchMedia never follows more than the hop limit and never a final redirect:follow", async () => {
  const port = await serve((req, res) => res.writeHead(302, { location: `/loop${Number((req.url || "/loop0").slice(5)) + 1}` }).end());
  const loop = `http://127.0.0.1:${port}`;
  await assert.rejects(
    fetchMedia(`${loop}/loop0`, new Headers(), "GET", { guard: async () => null, maxHops: 3 }),
    (e: unknown) => e instanceof UpstreamError && e.kind === "redirect",
  );
});

test("the production guard refuses a loopback ticket host outright", async () => {
  const res = await servePlexHls(ticket(), "t", null);
  assert.equal(res.status, 403);
});

test("text/html from a segment path is refused, and segments carry nosniff (Priya: XSS)", async () => {
  const html = await servePlexHls(ticket(), "t", `${S}/evil.html`, testGuard);
  assert.equal(html.status, 502);
  assert.equal(html.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await html.text()).includes("<script>"), false);
  const seg = await servePlexHls(ticket(), "t", `${S}/base/0.ts`, testGuard);
  assert.equal(seg.status, 200);
  assert.equal(seg.headers.get("content-type"), "video/mp2t");
  assert.equal(seg.headers.get("x-content-type-options"), "nosniff");
});

test("another session's folder and encoded traversal are refused before any fetch (Priya: confinement)", async () => {
  const before = seen.length;
  for (const rel of ["/video/:/transcode/universal/session/SOMEONE-ELSE/base/1.ts", `${S}/..%2f..%2f..%2flibrary%2fsections`, `${S}/..%5c..%5cx`, `${S}/%252e%252e/library`]) {
    const res = await servePlexHls(ticket(), "t", rel, testGuard);
    assert.equal(res.status, 400, rel);
  }
  assert.equal(seen.length, before, "nothing reached Plex");
});

test("the rewritten playlist has no token in any case and no dangling #EXTINF (Priya: token, EXTINF)", async () => {
  const res = await servePlexHls(ticket(), "t", null, testGuard);
  const body = decodeURIComponent(await res.text());
  assert.equal(body.includes(DUMMY), false);
  assert.equal(body.includes("evil.example"), false);
  assert.equal(body.split("\n").filter((l) => l.startsWith("#EXTINF")).length, 1);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("an oversized playlist is refused", async () => {
  const res = await servePlexHls(ticket("&big=1"), "t", null, testGuard);
  assert.equal(res.status, 502);
});

test("an upstream that never answers is timed out (Priya: hang)", async () => {
  const started = Date.now();
  await assert.rejects(
    fetchMedia(`${A}${START}?session=s1&hang=1`, new Headers(), "GET", { guard: testGuard, totalTimeoutMs: 300 }),
    (e: unknown) => e instanceof UpstreamError && e.kind === "timeout",
  );
  await assert.rejects(
    fetchMedia(`${A}${START}?session=s1&hang=1`, new Headers(), "GET", { guard: testGuard, headerTimeoutMs: 300 }),
    (e: unknown) => e instanceof UpstreamError && e.kind === "timeout",
  );
  assert.ok(Date.now() - started < 3000);
});

test("http→https keeps the port; only 80→443 with neither port written may change it (Priya nit)", () => {
  const ok = (o: string, c: string, n: string) => sameHostRedirect(new URL(o), new URL(c), new URL(n));
  assert.equal(ok("http://h:32400/a", "http://h:32400/a", "https://h/b"), false);
  assert.equal(ok("http://h:32400/a", "http://h:32400/a", "https://h:443/b"), false);
  assert.equal(ok("http://h:32400/a", "http://h:32400/a", "https://h:32400/b"), true);
  assert.equal(ok("http://h/a", "http://h/a", "https://h/b"), true);
  assert.equal(ok("http://h/a", "http://h/a", "https://h:8443/b"), false);
  assert.equal(ok("https://h:32400/a", "https://h:32400/a", "http://h:32400/b"), false);
  assert.equal(ok("http://h:32400/a", "http://h:32400/a", "http://other:32400/b"), false);
  assert.equal(ok("http://h:32400/a", "http://h:32400/a", "http://u:p@h:32400/b"), false);
});

test("a redirect from http://A:port to https://A (port dropped) is refused before any fetch", async () => {
  const port = await serve((_req, res) => res.writeHead(302, { location: "https://127.0.0.1/x" }).end());
  await assert.rejects(
    fetchMedia(`http://127.0.0.1:${port}/`, new Headers(), "GET", { guard: async () => null }),
    (e: unknown) => e instanceof UpstreamError && e.kind === "redirect",
  );
});
