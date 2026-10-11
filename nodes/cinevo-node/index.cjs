#!/usr/bin/env node
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { exec, execFile, spawn } = require("node:child_process");
const { ffmpegSegmentArgs, playlist } = require("./convert.cjs");
const { parseByteRange } = require("./range.cjs");

const VERSION = "0.3.0";
const PORT = Number(process.env.CINEVO_NODE_PORT || 48184);
function bindHost() {
  const raw = String(process.env.CINEVO_NODE_HOST || "127.0.0.1").trim();
  if (!/^[A-Za-z0-9.:-]{1,80}$/.test(raw)) return "127.0.0.1";
  return raw;
}
const HOST = bindHost();
const CODE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 4 * 60 * 60 * 1000;

function configDir() {
  // Allows test runs (and managed installations) to keep their private config
  // isolated instead of writing into an operator's actual home profile.
  if (process.env.CINEVO_NODE_CONFIG_DIR) return path.resolve(process.env.CINEVO_NODE_CONFIG_DIR);
  const home = os.homedir();
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support", "CINEVO Node");
  }
  if (process.platform === "win32") {
    return path.join(process.env.LOCALAPPDATA || home, "CINEVO", "Node");
  }
  return path.join(home, ".config", "cinevo-node");
}

function configPath() {
  return path.join(configDir(), "config.json");
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), "utf8"));
  } catch {
    return {
      deviceId: `cn-${crypto.randomBytes(6).toString("hex")}`,
      connections: [],
      selectedLibraries: [],
      folders: [],
  library: [],
  castCode: "",
  castExpires: 0,
    };
  }
}

function saveConfig(cfg) {
  const dir = configDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function makeCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let raw = "";
  for (let i = 0; i < 6; i++) raw += alphabet[crypto.randomInt(alphabet.length)];
  return `${raw.slice(0, 3)}-${raw.slice(3)}`;
}

function normCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

const state = {
  config: loadConfig(),
  code: makeCode(),
  codeExpires: Date.now() + CODE_TTL_MS,
  sessions: new Map(),
};

saveConfig(state.config);

function ensureCastCode() {
  if (!state.config.castCode || !state.config.castExpires || Date.now() > state.config.castExpires) {
    state.config.castCode = makeCode();
    state.config.castExpires = Date.now() + 12 * 60 * 60 * 1000;
    saveConfig(state.config);
  }
  return state.config.castCode;
}

function castMatches(input) {
  const raw = String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const current = String(ensureCastCode()).replace(/[^A-Z0-9]/g, "");
  return Boolean(raw) && raw === current && Date.now() < state.config.castExpires;
}

const receiver = {
  queue: [],
  now: { title: "", detail: "", playing: false, position: 0, volume: 1, titleId: "" },
};
let encoderReady;
let activeConverts = 0;

function detectEncoder() {
  return new Promise((resolve) => {
    execFile("ffmpeg", ["-hide_banner", "-encoders"], { timeout: 8000 }, (err, stdout) => {
      if (err) {
        resolve("");
        return;
      }
      const text = String(stdout || "");
      for (const name of ["h264_videotoolbox", "h264_nvenc", "h264_qsv", "libx264"]) {
        if (new RegExp(`\\b${name}\\b`).test(text)) {
          resolve(name);
          return;
        }
      }
      resolve("");
    });
  });
}

function encoder() {
  if (!encoderReady) encoderReady = detectEncoder();
  return encoderReady;
}

function probeDuration(filePath) {
  return new Promise((resolve) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", filePath],
      { timeout: 20000 },
      (err, stdout) => {
        const value = Number(String(stdout || "").trim());
        resolve(!err && Number.isFinite(value) && value > 0 ? value : 0);
      },
    );
  });
}

function streamConvert(req, res, filePath, index, whole, codec) {
  if (activeConverts >= 3) {
    send(res, 429, { error: "CINEVO is already converting three files. Try again in a moment." });
    return;
  }
  activeConverts += 1;
  const child = spawn("ffmpeg", ffmpegSegmentArgs(filePath, index, codec, whole), { stdio: ["ignore", "pipe", "pipe"] });
  let opened = false;
  const fail = () => {
    if (opened) return;
    opened = true;
    send(res, 503, { error: "ffmpeg could not convert this file." });
  };
  child.once("error", fail);
  child.stderr.on("data", () => {});
  child.stdout.once("data", (chunk) => {
    if (opened) return;
    opened = true;
    res.writeHead(200, {
      "Content-Type": "video/mp2t",
      "Cache-Control": "private, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(chunk);
    child.stdout.pipe(res);
  });
  const done = () => {
    activeConverts = Math.max(0, activeConverts - 1);
  };
  child.on("close", () => {
    done();
    if (!opened) fail();
    else if (!res.writableEnded) res.end();
  });
  res.on("close", () => {
    child.kill("SIGKILL");
  });
}

function libraryItem(id) {
  const rows = Array.isArray(state.config.library) ? state.config.library : [];
  return rows.find((item) => item && item.id === id) || null;
}

function rotateCode() {
  state.code = makeCode();
  state.codeExpires = Date.now() + CODE_TTL_MS;
}

function trustedBrowserOrigin(value) {
  if (!value) return true;
  let origin;
  try { origin = new URL(String(value)).origin; } catch { return false; }
  const allowed = new Set([
    "https://cinevo.fourtee2.digital",
    "http://localhost:8080", "http://127.0.0.1:8080",
    `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`,
    ...String(process.env.CINEVO_NODE_ALLOWED_ORIGINS || "")
      .split(",").map((item) => item.trim()).filter(Boolean),
  ]);
  return allowed.has(origin);
}

function localDashboardAccess(req) {
  // The physical machine controls pairing secrets and unpaired settings.
  // Never trust a caller-supplied header to authenticate a dashboard operation.
  const peer = String(req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (peer !== "::1" && !/^127\./.test(peer)) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // CLI / local OS integrations
  try {
    const url = new URL(String(origin));
    return url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      Number(url.port || 80) === PORT;
  } catch {
    return false;
  }
}

const pairFailures = new Map();
function tooManyPairAttempts(req) {
  const peer = String(req.socket.remoteAddress || "");
  const row = pairFailures.get(peer);
  if (!row || row.until < Date.now()) return false;
  return row.count >= 8;
}
function recordPairFailure(req) {
  const peer = String(req.socket.remoteAddress || "");
  const row = pairFailures.get(peer);
  if (!row || row.until < Date.now()) pairFailures.set(peer, { count: 1, until: Date.now() + CODE_TTL_MS });
  else row.count += 1;
}

function publicStatus() {
  return {
    deviceId: state.config.deviceId,
    version: VERSION,
    connections: (state.config.connections || []).map((c) => ({
      id: c.id,
      provider: c.provider,
      baseUrl: c.baseUrl,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    selectedLibraries: state.config.selectedLibraries || [],
    folders: (state.config.folders || []).map((f) => ({
      id: f.id,
      path: f.path,
      name: f.name,
      count: f.count || 0,
    })),
    pairingCodeExpiresAt: new Date(state.codeExpires).toISOString(),
  };
}

function send(res, status, body, extra = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const headers = {
    "Content-Type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Range",
    "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    ...extra,
  };
  res.writeHead(status, headers);
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > 1_000_000) {
        reject(new Error("payload too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const h = req.headers.authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

function requireSession(req, res) {
  const token = bearer(req);
  const session = token ? state.sessions.get(token) : null;
  if (!session || session.expires < Date.now()) {
    send(res, 401, { error: "The local pairing session expired" });
    return null;
  }
  return session;
}

function sessionFrom(req, url) {
  const token = bearer(req) || String(url.searchParams.get("token") || "");
  const session = token ? state.sessions.get(token) : null;
  if (!session || session.expires < Date.now()) return null;
  return session;
}

function contained(root, target) {
  const a = path.resolve(root);
  const b = path.resolve(target);
  const prefix = a.endsWith(path.sep) ? a : a + path.sep;
  return b === a || b.startsWith(prefix);
}

function underScannedFolder(filePath) {
  // A symlink under an approved folder must never escape into unrelated files.
  let realTarget;
  try { realTarget = fs.realpathSync(filePath); } catch { return false; }
  return (state.config.folders || []).some((folder) => {
    try {
      return contained(fs.realpathSync(folder.path), realTarget);
    } catch {
      return false;
    }
  });
}

function findPlayPath(id, rawPath) {
  if (rawPath) {
    const resolved = path.resolve(String(rawPath));
    if (underScannedFolder(resolved) && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
  }
  if (id) {
    for (const folder of state.config.folders || []) {
      const files = [];
      walkVideos(folder.path, files, 0);
      const hit = files.find((item) => `node-${hashStr(item.path)}` === id);
      if (hit) return hit.path;
    }
  }
  return null;
}

function mimeOf(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".mp4" || ext === ".m4v") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".mkv") return "video/x-matroska";
  if (ext === ".avi") return "video/x-msvideo";
  return "application/octet-stream";
}

function streamFile(req, res, filePath) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  const extra = {
    "Content-Type": mimeOf(filePath),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-transform",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
  };
  const range = parseByteRange(req.headers.range, size);
  if (range && range.unsatisfiable) {
    res.writeHead(416, { ...extra, "Content-Range": `bytes */${size}`, "Content-Length": "0" });
    res.end();
    return;
  }
  const status = range ? 206 : 200;
  const headers = range
    ? { ...extra, "Content-Length": String(range.end - range.start + 1), "Content-Range": `bytes ${range.start}-${range.end}/${size}` }
    : { ...extra, "Content-Length": String(size) };
  res.writeHead(status, headers);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const file = fs.createReadStream(filePath, range ? { start: range.start, end: range.end, highWaterMark: 1024 * 1024 } : { highWaterMark: 1024 * 1024 });
  file.on("error", (error) => res.destroy(error));
  res.on("close", () => file.destroy());
  file.pipe(res);
}

function brandPng() {
  const candidates = [
    path.join(__dirname, "brand", "icon-256.png"),
    path.join(process.cwd(), "brand", "icon-256.png"),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) return fs.readFileSync(file);
    } catch {
      /* ignore */
    }
  }
  return null;
}

function receiverHtml() {
  const code = ensureCastCode();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CINEVO Receiver</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: #050505; color: #f5f5f5; font-family: Inter, system-ui, sans-serif; }
    body { min-height: 100dvh; display: flex; flex-direction: column; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; padding: clamp(0.75rem, 2vw, 1.25rem) clamp(1rem, 3vw, 2rem); }
    .brand { font-weight: 800; letter-spacing: 0.14em; font-size: clamp(0.8rem, 2vw, 1rem); }
    .code { color: #55cfff; font-weight: 800; letter-spacing: 0.18em; font-size: clamp(1.1rem, 3vw, 1.8rem); }
    main { flex: 1; display: grid; place-items: center; padding: clamp(0.75rem, 2vw, 1.5rem); }
    video { width: min(100%, 1100px); max-height: 72dvh; background: #000; border-radius: 16px; }
    .idle { text-align: center; max-width: 36rem; }
    h1 { font-size: clamp(1.8rem, 5vw, 3.4rem); letter-spacing: -0.04em; margin: 0.2rem 0; }
    p { color: #a3a3a3; }
    .keys { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-top: 1rem; }
    button { min-height: 48px; min-width: 48px; border-radius: 12px; border: 1px solid rgba(255,255,255,.16); background: #141414; color: #fff; font: inherit; padding: 0 1rem; }
    button:focus-visible { outline: 2px solid #55cfff; }
  </style>
</head>
<body>
  <header>
    <div class="brand">CINEVO</div>
    <div class="code" id="code">${escapeHtml(code)}</div>
  </header>
  <main>
    <div class="idle" id="idle">
      <p>RECEIVER</p>
      <h1>Ready to cast</h1>
      <p>Use this code in the CINEVO phone app. A TV remote can play, pause, and skip.</p>
      <div class="keys">
        <button type="button" id="back" data-key="left">Back</button>
        <button type="button" id="play" data-key="enter">Play</button>
        <button type="button" id="fwd" data-key="right">Forward</button>
      </div>
    </div>
    <video id="player" controls playsinline hidden></video>
  </main>
  <script>
    const code = document.getElementById("code").textContent.trim();
    const video = document.getElementById("player");
    const idle = document.getElementById("idle");
    let titleId = "";
    function showVideo(on) {
      video.hidden = !on;
      idle.hidden = on;
    }
    async function report() {
      const position = video.duration ? Math.round((video.currentTime / video.duration) * 100) : 0;
      await fetch("/v1/receiver/now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code,
          now: { title: video.dataset.title || "", detail: "On this server", playing: !video.paused && !video.ended, position, volume: video.volume, titleId },
        }),
      }).catch(() => {});
    }
    async function playId(id, title) {
      titleId = id;
      video.dataset.title = title || "CINEVO";
      video.src = "/v1/receiver/stream?code=" + encodeURIComponent(code) + "&id=" + encodeURIComponent(id);
      showVideo(true);
      try { await video.play(); } catch (e) {}
      report();
    }
    async function poll() {
      const res = await fetch("/v1/receiver/poll?code=" + encodeURIComponent(code));
      if (!res.ok) return;
      const data = await res.json();
      for (const command of data.commands || []) {
        if (command.type === "playTitle") playId(command.titleId, command.title);
        if (command.type === "play") video.play().catch(() => {});
        if (command.type === "pause") video.pause();
        if (command.type === "toggle") video.paused ? video.play().catch(() => {}) : video.pause();
        if (command.type === "stop") { video.pause(); video.currentTime = 0; showVideo(false); }
        if (command.type === "seek" && video.duration) {
          if (typeof command.to === "number") video.currentTime = (command.to / 100) * video.duration;
          if (typeof command.by === "number") video.currentTime = Math.max(0, video.currentTime + command.by);
        }
        if (command.type === "volume") video.volume = command.value;
      }
    }
    document.getElementById("play").onclick = () => video.paused ? video.play().catch(() => {}) : video.pause();
    document.getElementById("back").onclick = () => { if (video.duration) video.currentTime = Math.max(0, video.currentTime - 10); };
    document.getElementById("fwd").onclick = () => { if (video.duration) video.currentTime = Math.min(video.duration, video.currentTime + 10); };
    window.addEventListener("keydown", (event) => {
      const key = event.key;
      if (key === "Enter" || key === " ") { event.preventDefault(); document.getElementById("play").click(); }
      if (key === "ArrowLeft" || key === "MediaRewind") document.getElementById("back").click();
      if (key === "ArrowRight" || key === "MediaFastForward") document.getElementById("fwd").click();
      if (key === "MediaPlayPause") document.getElementById("play").click();
    });
    setInterval(() => { poll().catch(() => {}); if (!video.hidden) report(); }, 1000);
    poll().catch(() => {});
  </script>
</body>
</html>`;
}

function dashboardHtml() {
  const code = Date.now() > state.codeExpires ? (rotateCode(), state.code) : state.code;
  const mins = Math.max(1, Math.round((state.codeExpires - Date.now()) / 60000));
  const conns = (state.config.connections || [])
    .map(
      (c) =>
        `<li><b>${escapeHtml(c.provider)}</b> <span>${escapeHtml(c.baseUrl)}</span></li>`,
    )
    .join("") || "<li class='empty'>No media servers yet. Add Plex or Jellyfin below — tokens stay on this computer.</li>";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CINEVO Node</title>
  <link rel="icon" href="/icon.png" />
  <link rel="apple-touch-icon" href="/icon.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root { --bg:#0b0b0b; --elev:#141414; --cyan:#3b7bff; --text:#f5f5f5; --muted:#a3a3a3; --line:rgba(255,255,255,.12); }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--text); font-family: Inter, system-ui, sans-serif; }
    header { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:20px 28px; border-bottom:1px solid var(--line); }
    .brand { display:flex; align-items:center; gap:10px; font-weight:800; letter-spacing:.12em; font-size:14px; }
    .brand img { width:28px; height:28px; border-radius:7px; }
    main { max-width:720px; margin:0 auto; padding:40px 24px 80px; }
    h1 { font-size:32px; letter-spacing:-.04em; margin:8px 0 12px; }
    p { color: var(--muted); line-height:1.6; }
    .code { font-size:42px; font-weight:800; letter-spacing:.18em; color:var(--cyan); margin:12px 0; }
    .card { border:1px solid var(--line); background:var(--elev); border-radius:16px; padding:20px; margin:18px 0; }
    label { display:block; font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted); margin:10px 0 6px; }
    input { width:100%; height:44px; border-radius:8px; border:1px solid var(--line); background:#111; color:var(--text); padding:0 12px; font-family:inherit; }
    button { height:44px; border:0; border-radius:8px; background:var(--cyan); color:#fff; font-family:inherit; font-weight:700; letter-spacing:.06em; padding:0 16px; cursor:pointer; }
    button.ghost { background:transparent; color:var(--cyan); border:1px solid var(--cyan); }
    ul { list-style:none; padding:0; }
    li { display:flex; justify-content:space-between; gap:12px; padding:10px 0; border-bottom:1px solid var(--line); font-size:14px; }
    .empty { color:var(--muted); }
    .row { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
  </style>
</head>
<body>
  <header>
    <div class="brand"><img src="/icon.png" alt="" />CINEVO NODE</div>
    <small>${escapeHtml(state.config.deviceId)} · v${VERSION} · ${escapeHtml(HOST)}:${PORT}</small>
  </header>
  <main>
    <p>PRIVATE COMPANION</p>
    <h1>Loopback only.</h1>
    <p>This process never leaves your machine. Pair CINEVO with the code below. It expires in about ${mins} minutes.</p>
    <div class="card">
      <label>PAIRING CODE</label>
      <div class="code">${escapeHtml(code)}</div>
      <p>Enter this in CINEVO on the same computer. Credentials for Plex or Jellyfin stay here.</p>
      <div class="row">
        <form method="post" action="/v1/code/rotate"><button class="ghost" type="submit">New code</button></form>
        <a href="/receiver"><button class="ghost" type="button">Open receiver</button></a>
      </div>
    </div>
    <div class="card">
      <label>CAST CODE</label>
      <div class="code">${escapeHtml(ensureCastCode())}</div>
      <p>Phones and the Android TV app use this code to cast and to remote-control the receiver. It lasts 12 hours. Do not share it off your home network.</p>
    </div>
    <div class="card">
      <label>CONNECTED SERVERS</label>
      <ul>${conns}</ul>
      <form method="post" action="/v1/connections" onsubmit="return pack(this)">
        <input type="hidden" name="payload" />
        <label>PROVIDER</label>
        <input name="provider" placeholder="plex, jellyfin, or preview" />
        <label>BASE URL</label>
        <input name="baseUrl" placeholder="http://127.0.0.1:32400" />
        <label>TOKEN / PASSWORD</label>
        <input name="secret" type="password" placeholder="Plex token or Jellyfin password" />
        <label>USERNAME (Jellyfin)</label>
        <input name="username" placeholder="optional" />
        <div class="row"><button type="submit">Save locally</button></div>
      </form>
    </div>
  </main>
  <script>
    function pack(form) {
      const data = {
        provider: form.provider.value.trim().toLowerCase() || "preview",
        baseUrl: form.baseUrl.value.trim() || "local://preview",
        token: form.secret.value,
        username: form.username.value,
        password: form.secret.value
      };
      form.payload.value = JSON.stringify(data);
      fetch("/v1/connections", { method: "POST", headers: { "Content-Type": "application/json", "X-Cinevo-Local": "dashboard" }, body: JSON.stringify(data) })
        .then(() => location.reload());
      return false;
    }
  </script>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&" + "amp;")
    .replace(/</g, "&" + "lt;")
    .replace(/>/g, "&" + "gt;")
    .replace(/"/g, "&" + "quot;");
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

const VIDEO_RE = /\.(mp4|mkv|mov|avi|webm|m4v|wmv|ts|m2ts)$/i;

function walkVideos(dir, acc, depth, root, dirs) {
  if (depth > 8 || acc.length >= 2000) return;
  const base = root || dir;
  if (dirs && depth > 0) {
    const rel = path.relative(base, dir).split(path.sep).join("/");
    if (rel) dirs.push(rel);
  }
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const entry of entries) {
    if (acc.length >= 2000) return;
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkVideos(full, acc, depth + 1, base, dirs);
    else if (VIDEO_RE.test(entry.name)) {
      acc.push({
        name: entry.name,
        path: full,
        folder: path.relative(base, path.dirname(full)).split(path.sep).join("/"),
      });
    }
  }
}

function prettyName(fileName) {
  let stem = fileName.replace(VIDEO_RE, "");
  stem = stem
    .replace(/[._]+/g, " ")
    .replace(/\((?:19|20)\d{2}\)/g, " ")
    .replace(/\b(?:19|20)\d{2}\b/g, " ")
    .replace(/\b(1080p|720p|2160p|4k|bluray|webrip|x264|x265)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stem || fileName;
}

function findSidecar(filePath) {
  const dir = path.dirname(filePath);
  const stem = path.basename(filePath).replace(VIDEO_RE, "");
  const names = [`${stem}.jpg`, `${stem}.jpeg`, `${stem}.png`, `${stem}.webp`, "poster.jpg", "folder.jpg", "cover.jpg", "poster.png", "folder.png"];
  for (const name of names) {
    const candidate = path.join(dir, name);
    try {
      const stat = fs.statSync(candidate);
      if (stat.isFile() && stat.size > 32 && stat.size < 1_500_000) return candidate;
    } catch {
      /* missing sidecar */
    }
  }
  return "";
}

function posterData(filePath, title, year) {
  const sidecar = findSidecar(filePath);
  if (sidecar) {
    const ext = path.extname(sidecar).toLowerCase();
    const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    const bytes = fs.readFileSync(sidecar).toString("base64");
    return `data:${mime};base64,${bytes}`;
  }
  const label = escapeHtml(title).slice(0, 42);
  const when = escapeHtml(year);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#0b0b0b"/><rect x="18" y="18" width="364" height="564" fill="none" stroke="rgba(255,255,255,0.18)"/><text x="36" y="290" fill="#f4fbff" font-family="Inter,system-ui,sans-serif" font-size="28" font-weight="700">${label}</text><text x="36" y="330" fill="#8aa0c4" font-family="Inter,system-ui,sans-serif" font-size="16">${when}</text><text x="36" y="560" fill="rgba(255,255,255,0.35)" font-family="Inter,system-ui,sans-serif" font-size="12" letter-spacing="2">CINEVO</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function yearOf(fileName) {
  const m = /\(?((?:19|20)\d{2})\)?/.exec(fileName);
  return m ? m[1] : "";
}

function episodeCode(filePath, fileName) {
  const normalized = String(filePath || fileName).replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const file = parts.pop() || fileName;
  let match = /s(\d{1,2})e(\d{1,3})/i.exec(file) || /\b(\d{1,2})x(\d{1,3})\b/i.exec(file);
  if (!match) {
    const parent = parts[parts.length - 1] || "";
    const season = /season\s*(\d{1,2})/i.exec(parent) || /^s(\d{1,2})$/i.exec(parent);
    const ep = /(?:^|[^a-z])(?:episode|ep)[\s._-]*(\d{1,3})\b/i.exec(file) || /^e(\d{1,3})\b/i.exec(file) || /^(\d{1,3})(?:[\s._-]|$)/.exec(String(file).replace(/\.[^.]+$/, ""));
    if (season && ep) match = [null, season[1], ep[1]];
  }
  if (!match) return "";
  return `S${String(Number(match[1])).padStart(2, "0")}E${String(Number(match[2])).padStart(2, "0")}`;
}

function titleFromVideo(file) {
  const year = yearOf(file.name);
  const code = episodeCode(file.path, file.name);
  let title = prettyName(file.name);
  if (code) {
    title = title
      .replace(/s\d{1,2}\s*e\d{1,3}/gi, " ")
      .replace(/\b\d{1,2}\s*x\s*\d{1,3}\b/gi, " ")
      .replace(/\b(?:episode|ep)\s*\d{1,3}\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (/^e\d{1,3}$/i.test(title)) title = "";
    const parts = String(file.path || "").replace(/\\/g, "/").split("/").filter(Boolean);
    parts.pop();
    const parent = parts[parts.length - 1] || "";
    const show = /season|^s\d{1,2}$/i.test(parent) ? parts[parts.length - 2] || "" : "";
    if (show && title.toLowerCase().startsWith(show.toLowerCase())) title = title.slice(show.length).trim();
    const head = show ? `${show} · ${code}` : code;
    title = title ? `${head} · ${title}` : head;
  }
  return {
    id: `node-${hashStr(file.path)}`,
    title: title || prettyName(file.name),
    year,
    kind: code ? "series" : "movie",
    genre: code ? "Series" : "Home video",
    path: file.path,
    folder: file.folder || "",
    poster: posterData(file.path, title || prettyName(file.name), year),
  };
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(data.error || data.message || `Server returned ${res.status}`);
  }
  return data;
}

async function jellyAuth(conn) {
  if (conn.accessToken && conn.userId) return conn;
  const data = await fetchJson(`${conn.baseUrl}/Users/AuthenticateByName`, {
    "Content-Type": "application/json",
    "X-Emby-Authorization":
      'MediaBrowser Client="CINEVO", Device="Node", DeviceId="cinevo-node", Version="0.1.0"',
  });
  // AuthenticateByName needs POST body — handle separately
  return conn;
}

async function jellyLogin(conn) {
  const res = await fetch(`${conn.baseUrl}/Users/AuthenticateByName`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Authorization":
        'MediaBrowser Client="CINEVO", Device="Node", DeviceId="cinevo-node", Version="0.1.0"',
    },
    body: JSON.stringify({ Username: conn.username, Pw: conn.token }),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.Message || "Jellyfin login failed");
  conn.accessToken = data.AccessToken;
  conn.userId = data.User && data.User.Id;
  saveConfig(state.config);
  return conn;
}

async function listSections(conn) {
  if (conn.provider === "preview") {
    return [{ key: "preview", title: "Preview catalog", type: "movie" }];
  }
  if (conn.provider === "plex") {
    const data = await fetchJson(`${conn.baseUrl}/library/sections`, {
      Accept: "application/json",
      "X-Plex-Token": conn.token,
    });
    const dirs = (((data.MediaContainer || {}).Directory) || []).map((d) => ({
      key: String(d.key),
      title: d.title,
      type: d.type,
    }));
    return dirs;
  }
  if (conn.provider === "jellyfin") {
    await jellyLogin(conn);
    const data = await fetchJson(`${conn.baseUrl}/Users/${conn.userId}/Views`, {
      "X-Emby-Token": conn.accessToken,
    });
    return (data.Items || []).map((d) => ({
      key: d.Id,
      title: d.Name,
      type: d.CollectionType || d.Type,
    }));
  }
  return [];
}

async function importSections(conn, keys) {
  if (conn.provider === "preview") {
    return [{ id: "preview-1", title: "Preview title", year: "2026", kind: "movie", sourceLabel: "Preview" }];
  }
  const wanted = new Set(keys.map(String));
  const titles = [];
  if (conn.provider === "plex") {
    for (const key of wanted) {
      const data = await fetchJson(`${conn.baseUrl}/library/sections/${key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=40`, {
        Accept: "application/json",
        "X-Plex-Token": conn.token,
      });
      const meta = ((data.MediaContainer || {}).Metadata) || [];
      for (const item of meta.slice(0, 40)) {
        titles.push({
          id: `plex-${item.ratingKey || hashStr(item.title)}`,
          title: item.title,
          year: String(item.year || ""),
          kind: item.type === "show" ? "series" : "movie",
          synopsis: item.summary || "",
          genre: ((item.Genre || [])[0] || {}).tag || "Plex",
          sourceLabel: conn.baseUrl,
        });
      }
    }
  }
  if (conn.provider === "jellyfin") {
    await jellyLogin(conn);
    for (const key of wanted) {
      const data = await fetchJson(
        `${conn.baseUrl}/Items?ParentId=${encodeURIComponent(key)}&IncludeItemTypes=Movie,Series&Recursive=true&Limit=40`,
        { "X-Emby-Token": conn.accessToken },
      );
      for (const item of data.Items || []) {
        titles.push({
          id: `jf-${item.Id}`,
          title: item.Name,
          year: String((item.ProductionYear) || ""),
          kind: item.Type === "Series" ? "series" : "movie",
          synopsis: item.Overview || "",
          genre: (item.Genres && item.Genres[0]) || "Jellyfin",
          sourceLabel: conn.baseUrl,
        });
      }
    }
  }
  return titles;
}

async function handle(req, res) {
  const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
  // Reject scripted requests from unrelated websites even when a user has
  // paired locally. Non-browser clients still need a valid bearer session.
  if (!trustedBrowserOrigin(req.headers.origin)) {
    send(res, 403, { error: "This website is not allowed to control CINEVO Node." }, {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Private-Network": "false",
    });
    return;
  }
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    send(res, 200, {
      ok: true,
      version: VERSION,
      deviceId: state.config.deviceId,
      loopback: HOST === "127.0.0.1" || HOST === "::1",
      port: PORT,
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/icon.png" || url.pathname === "/favicon.ico")) {
    const png = brandPng();
    if (!png) {
      send(res, 404, { error: "Icon missing" });
      return;
    }
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(png);
    return;
  }

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
    if (!localDashboardAccess(req)) return send(res, 403, { error: "Open this dashboard on the Node computer." });
    send(res, 200, dashboardHtml());
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/code/rotate") {
    if (!localDashboardAccess(req)) return send(res, 403, { error: "This action is local-only." });
    rotateCode();
    send(res, 302, "", { Location: "/" });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/pair") {
    if (tooManyPairAttempts(req)) return send(res, 429, { error: "Too many pairing attempts. Try again later." });
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 400, { error: e.message });
      return;
    }
    if (Date.now() > state.codeExpires) rotateCode();
    const code = normCode(body.code);
    if (!code || code !== normCode(state.code)) {
      recordPairFailure(req);
      send(res, 401, { error: "Pairing was not accepted" });
      return;
    }
    pairFailures.delete(String(req.socket.remoteAddress || ""));
    const token = crypto.randomBytes(24).toString("hex");
    const expires = Date.now() + SESSION_TTL_MS;
    state.sessions.set(token, { expires, createdAt: Date.now() });
    rotateCode();
    send(res, 200, { token, expiresAt: new Date(expires).toISOString(), deviceId: state.config.deviceId });
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/status") {
    if (!requireSession(req, res)) return;
    send(res, 200, publicStatus());
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/connections") {
    const localDash = localDashboardAccess(req);
    if (!localDash && !requireSession(req, res)) return;
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 400, { error: e.message });
      return;
    }
    const provider = String(body.provider || "preview").toLowerCase();
    if (!["plex", "jellyfin", "preview"].includes(provider)) {
      send(res, 400, { error: "Unknown provider" });
      return;
    }
    const now = new Date().toISOString();
    const conn = {
      id: `conn-${crypto.randomBytes(4).toString("hex")}`,
      provider,
      baseUrl: String(body.baseUrl || (provider === "preview" ? "local://preview" : "")).replace(/\/$/, ""),
      token: String(body.token || body.password || ""),
      username: String(body.username || ""),
      createdAt: now,
      updatedAt: now,
    };
    if (provider !== "preview" && !conn.baseUrl) {
      send(res, 400, { error: "A local server address is required" });
      return;
    }
    state.config.connections.push(conn);
    saveConfig(state.config);
    send(res, 200, { id: conn.id, provider: conn.provider, baseUrl: conn.baseUrl });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/connections/revoke") {
    if (!requireSession(req, res)) return;
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 400, { error: e.message });
      return;
    }
    const id = String(body.connectionId || "");
    state.config.connections = (state.config.connections || []).filter((c) => c.id !== id);
    saveConfig(state.config);
    send(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/v1/folders" && req.method === "GET") {
    if (!requireSession(req, res)) return;
    send(res, 200, {
      folders: (state.config.folders || []).map((f) => ({
        id: f.id,
        path: f.path,
        name: f.name,
        count: f.count || 0,
      })),
    });
    return;
  }

  if (url.pathname === "/v1/folders" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 400, { error: e.message });
      return;
    }
    const folderPath = String(body.path || "").trim();
    if (!folderPath) {
      send(res, 400, { error: "Choose a folder path" });
      return;
    }
    if (folderPath.includes("\0") || folderPath === "/") {
      send(res, 400, { error: "That path is not allowed" });
      return;
    }
    let stat;
    try {
      stat = fs.statSync(folderPath);
    } catch {
      send(res, 400, { error: "CINEVO Node could not open that folder" });
      return;
    }
    if (!stat.isDirectory()) {
      send(res, 400, { error: "That path is not a folder" });
      return;
    }
    const files = [];
    const network = [];
    walkVideos(folderPath, files, 0, folderPath, network);
    const name = path.basename(folderPath);
    const folder = {
      id: `folder-${crypto.randomBytes(4).toString("hex")}`,
      path: folderPath,
      name,
      count: files.length,
    };
    state.config.folders = (state.config.folders || []).filter((item) => path.resolve(item.path) !== path.resolve(folderPath));
    state.config.folders.push(folder);
    const library = files.map((f) => titleFromVideo(f));
    const existing = (state.config.library || []).filter((item) => !contained(folderPath, item.path));
    state.config.library = [...existing, ...library.map((item) => ({
      id: item.id,
      title: item.title,
      year: item.year,
      path: item.path,
    }))];
    saveConfig(state.config);
    send(res, 200, {
      id: folder.id,
      name,
      count: files.length,
      titles: library,
      network: [...new Set(network)].slice(0, 400),
    });
    return;
  }

  if (url.pathname === "/v1/sections" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 400, { error: e.message });
      return;
    }
    const conn = (state.config.connections || []).find((c) => c.id === body.connectionId);
    if (!conn) {
      send(res, 404, { error: "Connection not found" });
      return;
    }
    try {
      const sections = await listSections(conn);
      send(res, 200, { sections });
    } catch (e) {
      send(res, 502, { error: e.message || "Media server did not respond" });
    }
    return;
  }

  if (url.pathname === "/v1/import" && req.method === "POST") {
    if (!requireSession(req, res)) return;
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 400, { error: e.message });
      return;
    }
    const conn = (state.config.connections || []).find((c) => c.id === body.connectionId);
    if (!conn) {
      send(res, 404, { error: "Connection not found" });
      return;
    }
    try {
      const titles = await importSections(conn, Array.isArray(body.sectionKeys) ? body.sectionKeys : []);
      send(res, 200, { titles });
    } catch (e) {
      send(res, 502, { error: e.message || "Import failed" });
    }
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/v1/play") {
    if (!sessionFrom(req, url)) {
      send(res, 401, { error: "The local pairing session expired" });
      return;
    }
    const filePath = findPlayPath(url.searchParams.get("id") || "", url.searchParams.get("path") || "");
    if (!filePath) {
      send(res, 404, { error: "That file is not in a scanned Node folder." });
      return;
    }
    if (url.searchParams.get("fit") === "compatible") {
      const codec = await encoder();
      if (!codec) {
        send(res, 503, { error: "Install ffmpeg on this computer. CINEVO Node uses it when a file will not play in the browser." });
        return;
      }
      const duration = await probeDuration(filePath);
      const body = playlist({
        filePath: url.searchParams.get("path") || filePath,
        id: url.searchParams.get("id") || "",
        token: url.searchParams.get("token") || "",
        duration,
      });
      res.writeHead(200, {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "private, no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(body);
      return;
    }
    streamFile(req, res, filePath);
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/v1/convert") {
    if (!sessionFrom(req, url)) {
      send(res, 401, { error: "The local pairing session expired" });
      return;
    }
    const filePath = findPlayPath(url.searchParams.get("id") || "", url.searchParams.get("path") || "");
    if (!filePath) {
      send(res, 404, { error: "That file is not in a scanned Node folder." });
      return;
    }
    const codec = await encoder();
    if (!codec) {
      send(res, 503, { error: "Install ffmpeg on this computer. CINEVO Node uses it when a file will not play in the browser." });
      return;
    }
    const index = Math.max(0, Math.min(20000, Number(url.searchParams.get("i")) || 0));
    if (req.method === "HEAD") {
      res.writeHead(200, { "Content-Type": "video/mp2t", "Access-Control-Allow-Origin": "*" });
      res.end();
      return;
    }
    streamConvert(req, res, filePath, index, url.searchParams.get("whole") === "1", codec);
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/receiver") {
    const titles = (state.config.library || []).slice(0, 80).map((item) => ({
      id: item.id,
      title: item.title,
      year: item.year || "",
    }));
    send(res, 200, { ok: true, now: receiver.now, titles });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/cast") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 400, { error: e.message });
      return;
    }
    if (!castMatches(body.code)) {
      send(res, 401, { error: "That receiver code is not valid." });
      return;
    }
    const type = String(body.type || "");
    const allowed = ["toggle", "play", "pause", "stop", "seek", "volume", "playTitle"];
    if (!allowed.includes(type)) {
      send(res, 400, { error: "Unknown command." });
      return;
    }
    if (receiver.queue.length >= 24) {
      send(res, 429, { error: "The receiver is busy." });
      return;
    }
    const command = { id: crypto.randomBytes(4).toString("hex"), type };
    if (type === "seek") {
      if (body.to !== undefined) command.to = Math.max(0, Math.min(100, Number(body.to) || 0));
      if (body.by !== undefined) command.by = Math.max(-60, Math.min(60, Number(body.by) || 0));
    }
    if (type === "volume") command.value = Math.max(0, Math.min(1, Number(body.value) || 0));
    if (type === "playTitle") {
      const item = libraryItem(String(body.titleId || ""));
      if (!item) {
        send(res, 404, { error: "That title is not on this server." });
        return;
      }
      command.titleId = item.id;
      command.title = item.title;
    }
    receiver.queue.push(command);
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/v1/receiver/poll") {
    if (!castMatches(url.searchParams.get("code"))) {
      send(res, 401, { error: "That receiver code is not valid." });
      return;
    }
    const commands = receiver.queue.splice(0, receiver.queue.length);
    send(res, 200, { ok: true, commands, now: receiver.now });
    return;
  }

  if (req.method === "POST" && url.pathname === "/v1/receiver/now") {
    let body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 400, { error: e.message });
      return;
    }
    if (!castMatches(body.code)) {
      send(res, 401, { error: "That receiver code is not valid." });
      return;
    }
    const now = body.now && typeof body.now === "object" ? body.now : {};
    receiver.now = {
      title: String(now.title || "").slice(0, 120),
      detail: String(now.detail || "").slice(0, 80),
      playing: now.playing === true,
      position: Math.max(0, Math.min(100, Number(now.position) || 0)),
      volume: Math.max(0, Math.min(1, Number(now.volume) || 1)),
      titleId: String(now.titleId || "").slice(0, 160),
    };
    send(res, 200, { ok: true });
    return;
  }

  if ((req.method === "GET" || req.method === "HEAD") && url.pathname === "/v1/receiver/stream") {
    if (!castMatches(url.searchParams.get("code"))) {
      send(res, 401, { error: "That receiver code is not valid." });
      return;
    }
    const item = libraryItem(url.searchParams.get("id") || "");
    if (!item) {
      send(res, 404, { error: "That title is not on this server." });
      return;
    }
    streamFile(req, res, item.path);
    return;
  }

  if (req.method === "GET" && url.pathname === "/receiver") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(receiverHtml());
    return;
  }

  send(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    send(res, 500, { error: err.message || "Node error" });
  });
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    console.error(`CINEVO Node: port ${PORT} is already in use on ${HOST}`);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`CINEVO Node v${VERSION}`);
  console.log(`Loopback dashboard: http://${HOST}:${PORT}`);
  console.log(`Pairing code: ${state.code} (expires in 10 minutes)`);
  console.log(`Cast code: ${ensureCastCode()} (receiver)`);
  console.log("Receiver: /receiver  · phones can cast and remote-control with the cast code.");
  if (!process.argv.includes("--no-open")) openBrowser(`http://${HOST}:${PORT}`);
});

function openBrowser(url) {
  const safe = url.replace(/"/g, "");
  let cmd;
  if (process.platform === "darwin") cmd = `open "${safe}"`;
  else if (process.platform === "win32") cmd = `cmd /c start "" "${safe}"`;
  else cmd = `xdg-open "${safe}"`;
  exec(cmd, () => {});
}
