// Priya's re-review of 25d858f, N11a/N11b: open and import followed redirects off
// the guarded host with the token and echoed the foreign body. Fake servers on
// loopback; the guard trusts only the fake Plex host A.
import assert from "node:assert/strict";
import http from "node:http";
import test, { after } from "node:test";
import { strictGuard, type AddressGuard } from "./media-proxy.server.ts";
import { plexServerJson } from "./plex-server-fetch.server.ts";

const DUMMY = "dummy-token-not-real";
const servers: http.Server[] = [];
const hitsC: { url: string; gotToken: boolean }[] = [];
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

const portC = await serve((req, res) => {
  hitsC.push({ url: req.url || "", gotToken: req.headers["x-plex-token"] === DUMMY });
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ message: "internal-secret-from-C" }));
});
const portA = await serve((req, res) => {
  const u = req.url || "";
  if (u.startsWith("/redir")) return res.writeHead(302, { location: `http://127.0.0.1:${portC}/library/sections` }).end();
  if (u.startsWith("/mapped")) return res.writeHead(302, { location: `http://[::ffff:127.0.0.1]:${portC}/x` }).end();
  if (u.startsWith("/error")) {
    return res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ error: "internal-secret-from-A", message: "internal-secret-from-A" }));
  }
  if (u.startsWith("/same")) return res.writeHead(302, { location: "/library/sections" }).end();
  if (u.startsWith("/hang")) return;
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ MediaContainer: { size: 1 } }));
});
const A = `http://127.0.0.1:${portA}`;
const strict = strictGuard();
const trustA: AddressGuard = async (url) => (new URL(url).host === new URL(A).host ? null : strict(url));
const H = { "X-Plex-Token": DUMMY, Accept: "application/json" };

test("open/import: a redirect off the server's host is refused; the token and body never cross (Priya N11a)", async () => {
  for (const path of ["/redir", "/mapped"]) {
    await assert.rejects(plexServerJson(`${A}${path}`, H, 3000, trustA), /not allowed/, path);
  }
  assert.equal(hitsC.length, 0);
});

test("open/import: an upstream error body is not echoed, only a generic message and the status (Priya N11b)", async () => {
  await assert.rejects(plexServerJson(`${A}/error`, H, 3000, trustA), (err: Error) => {
    assert.equal(err.message.includes("internal-secret"), false);
    assert.match(err.message, /500/);
    return true;
  });
});

test("open/import: same-host redirects and plain JSON still work", async () => {
  assert.deepEqual(await plexServerJson(`${A}/same`, H, 3000, trustA), { MediaContainer: { size: 1 } });
});

test("open/import: the production guard refuses a loopback server, and a hang times out", async () => {
  await assert.rejects(plexServerJson(`${A}/library/sections`, H, 3000), /not allowed/);
  await assert.rejects(plexServerJson(`${A}/hang`, H, 300, trustA), /too long/);
});
