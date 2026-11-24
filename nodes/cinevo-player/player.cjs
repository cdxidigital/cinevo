"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const HOST = "127.0.0.1";
const PORT = Number(process.env.CINEVO_PLAYER_PORT || 48185);
const TYPES = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".wav": "audio/wav",
};

const initial = process.argv.slice(2).find((arg) => arg && !arg.startsWith("-")) || "";

function localFile(input) {
  if (!input) return null;
  let real;
  try {
    real = fs.realpathSync(path.resolve(input));
    const stat = fs.statSync(real);
    if (!stat.isFile()) return null;
    return { real, stat };
  } catch {
    return null;
  }
}

function page(filePath) {
  const safe = JSON.stringify(filePath || "");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CINEVO Player</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #09090b; color: #f4f4f5; font: 16px/1.45 Segoe UI, sans-serif; }
    main { width: min(960px, calc(100% - 2rem)); margin: 0 auto; padding: 2rem 0 3rem; }
    h1 { margin: 0; letter-spacing: 0.08em; font-size: 1.6rem; }
    p { color: #d4d4d8; }
    form, .row { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 1rem 0; }
    input { flex: 1 1 16rem; min-height: 2.8rem; padding: 0 0.8rem; border: 1px solid #3f3f46; border-radius: 0.7rem; background: #18181b; color: white; }
    button, a.btn { min-height: 2.8rem; padding: 0 1rem; border: 0; border-radius: 0.7rem; background: #8b2fff; color: white; font: inherit; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; }
    video { width: 100%; max-height: 70vh; background: black; border-radius: 0.8rem; }
    small { color: #a1a1aa; }
    .bad { color: #fda4af; }
  </style>
</head>
<body>
  <main>
    <h1>CINEVO</h1>
    <p>Player for this computer. Files stay here. This window only listens on 127.0.0.1.</p>
    <form id="play">
      <input id="path" name="path" placeholder="C:\\Videos\\film.mp4" value=${safe} />
      <button type="submit">Play file</button>
    </form>
    <p id="status"></p>
    <video id="screen" controls playsinline></video>
    <div class="row">
      <input id="house" placeholder="https://your-cinevo" />
      <a class="btn" id="open" href="https://cinevo.fourtee2.digital/app">Open house</a>
    </div>
    <small>Published by fourtee2digital. Developed by cdxidigital.</small>
  </main>
  <script>
    const path = document.getElementById("path");
    const status = document.getElementById("status");
    const screen = document.getElementById("screen");
    const house = document.getElementById("house");
    const open = document.getElementById("open");
    function play(value) {
      const file = String(value || "").trim();
      if (!file) { status.textContent = "Enter a file on this computer."; return; }
      status.textContent = "";
      status.className = "";
      screen.src = "/media?path=" + encodeURIComponent(file);
      screen.play().catch(() => undefined);
    }
    document.getElementById("play").onsubmit = (event) => { event.preventDefault(); play(path.value); };
    screen.onerror = () => { status.textContent = "This player could not open that file."; status.className = "bad"; };
    house.oninput = () => {
      const raw = house.value.trim();
      open.href = /^https?:\\/\\//.test(raw) ? raw : "https://cinevo.fourtee2.digital/app";
    };
    if (path.value) play(path.value);
  </script>
</body>
</html>`;
}

function sendFile(req, res, file) {
  const { real, stat } = file;
  const type = TYPES[path.extname(real).toLowerCase()] || "application/octet-stream";
  const total = stat.size;
  let start = 0;
  let end = total - 1;
  const range = req.headers.range;
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${total}` });
      res.end();
      return;
    }
    if (match[1]) start = Number(match[1]);
    if (match[2]) end = Number(match[2]);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= total) {
      res.writeHead(416, { "Content-Range": `bytes */${total}` });
      res.end();
      return;
    }
    end = Math.min(end, total - 1);
    res.writeHead(206, {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Content-Length": end - start + 1,
    });
  } else {
    res.writeHead(200, {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": total,
    });
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(real, { start, end }).pipe(res);
}

function openWindow(url) {
  if (process.platform !== "win32" || process.env.CINEVO_PLAYER_NO_OPEN === "1") return;
  const local = process.env.LOCALAPPDATA || "";
  const candidates = [
    path.join(local, "Microsoft", "Edge", "Application", "msedge.exe"),
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
  ];
  const exe = candidates.find((item) => fs.existsSync(item));
  const dataDir = path.join(local || process.env.TEMP || ".", "CINEVO", "Player");
  if (exe) {
    spawn(exe, [`--app=${url}`, `--user-data-dir=${dataDir}`, "--window-size=1280,800"], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return;
  }
  spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}`);
  if (url.pathname === "/" || url.pathname === "/player") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(page(initial));
    return;
  }
  if (url.pathname === "/media") {
    const file = localFile(url.searchParams.get("path") || "");
    if (!file) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not a file on this computer.");
      return;
    }
    sendFile(req, res, file);
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`;
  console.log(`CINEVO Player on ${url}`);
  openWindow(url);
});
