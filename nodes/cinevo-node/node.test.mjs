import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.dirname(fileURLToPath(import.meta.url));
// Each test gets its own port and private config, independent of other tests
// and independent of a developer's actual paired media server.
let nextPort = 48185;

function start(t) {
  const port = nextPort++;
  const privateConfig = fs.mkdtempSync(path.join(os.tmpdir(), "cinevo-node-test-config-"));
  const child = spawn(process.execPath, [path.join(root, "index.cjs"), "--no-open"], {
    env: {
      ...process.env,
      CINEVO_NODE_PORT: String(port),
      CINEVO_NODE_HOST: "127.0.0.1",
      CINEVO_NODE_CONFIG_DIR: privateConfig,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.testPort = port;
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGTERM");
    fs.rmSync(privateConfig, { recursive: true, force: true });
  });
  return child;
}

async function waitReady(child) {
  let buf = "";
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("node did not start")), 8000);
    child.stdout.on("data", (c) => {
      buf += c.toString();
      if (buf.includes("Pairing code:") && buf.includes("Cast code:")) {
        clearTimeout(t);
        const pair = /Pairing code: ([A-Z0-9-]+)/.exec(buf);
        const cast = /Cast code: ([A-Z0-9-]+)/.exec(buf);
        resolve({ pair: pair ? pair[1] : "", cast: cast ? cast[1] : "" });
      }
    });
    child.stderr.on("data", (c) => {
      buf += c.toString();
    });
    child.on("exit", (code) => reject(new Error(`exited ${code}: ${buf}`)));
  });
}

test("loopback health, pair, and 401 without bearer", async (t) => {
  const child = start(t);
  const codes = await waitReady(child);
  const code = codes.pair;
  const base = `http://127.0.0.1:${child.testPort}`;

  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.ok, true);
  assert.equal(health.loopback, true);

  const denied = await fetch(`${base}/v1/status`);
  assert.equal(denied.status, 401);

  const bad = await fetch(`${base}/v1/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "NOPE-00" }),
  });
  assert.equal(bad.status, 401);

  const pair = await fetch(`${base}/v1/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  assert.equal(pair.status, 200);
  const session = await pair.json();
  assert.ok(session.token);

  const status = await fetch(`${base}/v1/status`, {
    headers: { Authorization: `Bearer ${session.token}` },
  });
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.ok(body.deviceId);
  assert.ok(Array.isArray(body.connections));
  const pairPlain = await fetch(`${base}/v1/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: code.replace("-", "") }),
  });
  // First pair already rotated the code; a second pair with the old code must fail.
  assert.equal(pairPlain.status, 401);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinevo-node-"));
  const file = path.join(dir, "Demo.Movie.2024.mp4");
  fs.writeFileSync(file, Buffer.from("CINEVO-FAKE-MP4-CONTENT-0123456789"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const added = await fetch(`${base}/v1/folders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: dir }),
  });
  assert.equal(added.status, 200);
  const listed = await added.json();
  assert.equal(listed.count, 1);
  const title = listed.titles[0];
  assert.ok(title.path);
  assert.equal(title.year, "2024");
  assert.equal(title.title, "Demo Movie");
  assert.match(title.poster, /^data:image\/svg\+xml/);
  assert.match(decodeURIComponent(title.poster), /Demo Movie/);

  const deniedPlay = await fetch(`${base}/v1/play?path=${encodeURIComponent(title.path)}`);
  assert.equal(deniedPlay.status, 401);

  const play = await fetch(`${base}/v1/play?path=${encodeURIComponent(title.path)}&token=${session.token}`);
  assert.equal(play.status, 200);
  assert.equal(play.headers.get("content-type"), "video/mp4");
  assert.equal(play.headers.get("accept-ranges"), "bytes");
  const bodyBytes = Buffer.from(await play.arrayBuffer());
  assert.equal(bodyBytes.toString(), "CINEVO-FAKE-MP4-CONTENT-0123456789");

  const ranged = await fetch(`${base}/v1/play?path=${encodeURIComponent(title.path)}&token=${session.token}`, {
    headers: { Range: "bytes=0-5" },
  });
  assert.equal(ranged.status, 206);
  assert.equal(Buffer.from(await ranged.arrayBuffer()).toString(), "CINEVO");

  const deniedCast = await fetch(`${base}/v1/cast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "NOPE00", type: "pause" }),
  });
  assert.equal(deniedCast.status, 401);
  const cast = await fetch(`${base}/v1/cast`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: codes.cast, type: "pause" }),
  });
  assert.equal(cast.status, 200);
  const polled = await (await fetch(`${base}/v1/receiver/poll?code=${encodeURIComponent(codes.cast)}`)).json();
  assert.equal(polled.commands[0].type, "pause");
  const page = await fetch(`${base}/receiver`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Ready to cast/);
});


test("dashboard pairing secrets cannot be read by a foreign website", async (t) => {
  const child = start(t);
  await waitReady(child);
  const base = `http://127.0.0.1:${child.testPort}`;
  const foreign = await fetch(base + "/dashboard", { headers: { Origin: "https://untrusted.example" } });
  assert.equal(foreign.status, 403);
  const local = await fetch(base + "/dashboard", { headers: { Origin: base } });
  assert.equal(local.status, 200);
  assert.match(await local.text(), /CINEVO NODE/);
  const forged = await fetch(base + "/v1/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Cinevo-Local": "dashboard", Origin: "https://untrusted.example" },
    body: JSON.stringify({ provider: "preview" }),
  });
  assert.equal(forged.status, 403);
});

test("file HTTP ranges handle suffix, reversal and HEAD correctly", async (t) => {
  const child = start(t);
  const { pair } = await waitReady(child);
  const base = `http://127.0.0.1:${child.testPort}`;
  const joined = await fetch(base + "/v1/pair", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: pair }),
  });
  assert.equal(joined.status, 200);
  const { token } = await joined.json();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cinevo-range-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const f = path.join(dir, "Range.Test.mp4");
  fs.writeFileSync(f, "0123456789");
  const added = await fetch(base + "/v1/folders", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ path: dir }),
  });
  assert.equal(added.status, 200);
  const stream = base + "/v1/play?token=" + encodeURIComponent(token) + "&path=" + encodeURIComponent(f);
  const suffix = await fetch(stream, { headers: { Range: "bytes=-3" } });
  assert.equal(suffix.status, 206);
  assert.equal(suffix.headers.get("content-range"), "bytes 7-9/10");
  assert.equal(await suffix.text(), "789");
  const reversed = await fetch(stream, { headers: { Range: "bytes=8-4" } });
  assert.equal(reversed.status, 416);
  assert.equal(reversed.headers.get("content-range"), "bytes */10");
  const head = await fetch(stream, { method: "HEAD", headers: { Range: "bytes=3-5" } });
  assert.equal(head.status, 206);
  assert.equal(head.headers.get("content-length"), "3");
  assert.equal(head.headers.get("content-range"), "bytes 3-5/10");
});

test("a symlink in an indexed folder cannot escape the approved media root", async (t) => {
  const child = start(t);
  const { pair } = await waitReady(child);
  const base = `http://127.0.0.1:${child.testPort}`;
  const joined = await fetch(base + "/v1/pair", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: pair }),
  });
  assert.equal(joined.status, 200);
  const { token } = await joined.json();
  const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "cinevo-not-scanned-"));
  const mediaDir = fs.mkdtempSync(path.join(os.tmpdir(), "cinevo-indexed-"));
  t.after(() => { fs.rmSync(privateDir, { recursive: true, force: true }); fs.rmSync(mediaDir, { recursive: true, force: true }); });
  const target = path.join(privateDir, "private.mp4");
  fs.writeFileSync(target, "NOT PART OF THIS LIBRARY");
  const link = path.join(mediaDir, "linked.mp4");
  fs.symlinkSync(target, link);
  const allowed = await fetch(base + "/v1/folders", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: mediaDir }),
  });
  assert.equal(allowed.status, 200);
  const leaked = await fetch(base + "/v1/play?token=" + encodeURIComponent(token) + "&path=" + encodeURIComponent(link));
  assert.equal(leaked.status, 404);
});

test("untrusted sites cannot pair even with an otherwise valid code", async (t) => {
  const child = start(t);
  const { pair } = await waitReady(child);
  const base = `http://127.0.0.1:${child.testPort}`;
  const foreign = await fetch(base + "/v1/pair", {
    method: "POST",
    headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" },
    body: JSON.stringify({ code: pair }),
  });
  assert.equal(foreign.status, 403);
  const legit = await fetch(base + "/v1/pair", {
    method: "POST",
    headers: { Origin: "https://cinevo.fourtee2.digital", "Content-Type": "application/json" },
    body: JSON.stringify({ code: pair }),
  });
  assert.equal(legit.status, 200);
});
