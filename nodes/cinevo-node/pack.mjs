#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "../..");
const dist = path.join(root, "dist");
const out = path.join(repo, "public", "installers");
const brand = path.join(root, "brand");
const tools = path.join(root, "tools");
const VERSION = "0.2.0";

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(tools, { recursive: true });

execFileSync("python3", [path.join(brand, "generate-icon.py")], { stdio: "inherit" });
fs.copyFileSync(path.join(brand, "icon-256.png"), path.join(repo, "public", "node-icon.png"));
fs.copyFileSync(path.join(brand, "icon-32.png"), path.join(repo, "public", "node-icon-32.png"));

const pkgBin = path.join(repo, "node_modules", "@yao-pkg", "pkg", "lib-es5", "bin.js");
const targets = [
  { t: "node22-win-x64", fragment: "win-x64" },
  { t: "node22-macos-x64", fragment: "macos-x64" },
  { t: "node22-macos-arm64", fragment: "macos-arm64" },
  { t: "node22-linux-x64", fragment: "linux-x64" },
];

function runPkg() {
  const args = [
    path.join(root, "index.cjs"),
    "--config",
    path.join(root, "package.json"),
    "--targets",
    targets.map((x) => x.t).join(","),
    "--output",
    path.join(dist, "cinevo-node"),
    "--compress",
    "GZip",
    "--public",
    "--fallback-to-source",
    "--signature",
  ];
  execFileSync(process.execPath, [pkgBin, ...args], {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env, PATH: `${tools}${path.delimiter}${process.env.PATH || ""}` },
  });
}

function write(file, content, mode = 0o644) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.chmodSync(file, mode);
}

function zipDir(src, destZip) {
  if (fs.existsSync(destZip)) fs.unlinkSync(destZip);
  const base = destZip.replace(/\.zip$/i, "");
  const py = spawnSync(
    "python3",
    ["-c", "import shutil, sys; shutil.make_archive(sys.argv[1], 'zip', sys.argv[2])", base, src],
    { stdio: "inherit" },
  );
  if (py.status !== 0 || !fs.existsSync(destZip)) {
    throw new Error(`zip failed for ${destZip}`);
  }
}

function verifyBinary(file, kind) {
  const buf = fs.readFileSync(file);
  if (kind === "pe") {
    if (buf[0] !== 0x4d || buf[1] !== 0x5a) throw new Error(`${file} is not a PE executable`);
  }
  if (kind === "macho") {
    const magic = buf.readUInt32BE(0);
    const ok = [0xfeedface, 0xfeedfacf, 0xcafebabe, 0xcffaedfe, 0xcefaedfe].includes(magic);
    if (!ok) throw new Error(`${file} is not a Mach-O executable`);
  }
  if (kind === "elf") {
    if (buf[0] !== 0x7f || buf[1] !== 0x45 || buf[2] !== 0x4c || buf[3] !== 0x46) {
      throw new Error(`${file} is not an ELF executable`);
    }
  }
  console.log(`verified ${kind}: ${path.basename(file)} (${buf.length} bytes)`);
}

function brandWindowsExe(exePath) {
  const ResEdit = require("resedit");
  const data = fs.readFileSync(exePath);
  const NtExecutable = ResEdit.NtExecutable || ResEdit.default?.NtExecutable;
  const NtExecutableResource = ResEdit.NtExecutableResource || ResEdit.default?.NtExecutableResource;
  const exe = NtExecutable.from(data, { ignoreCert: true });
  const res = NtExecutableResource.from(exe);
  const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(brand, "icon.ico")));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = groups[0]?.id ?? 1;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groupId,
    1033,
    iconFile.icons.map((item) => item.data),
  );
  const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  if (viList[0]) {
    const vi = viList[0];
    vi.setFileVersion(0, 2, 0, 0, 1033);
    vi.setProductVersion(0, 2, 0, 0, 1033);
    vi.setStringValues(
      { lang: 1033, codepage: 1200 },
      {
        FileDescription: "CINEVO",
        ProductName: "CINEVO",
        CompanyName: "CDXI",
        LegalCopyright: "CDXI. Distributed as a Fourtee2 Digital project.",
        OriginalFilename: "cinevo-node.exe",
        InternalName: "CINEVO",
        FileVersion: VERSION,
        ProductVersion: VERSION,
        Comments: "CINEVO server for this computer. It does not change other programs.",
      },
    );
    vi.outputToResourceEntries(res.entries);
  }
  const manifest = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="CINEVO" version="${VERSION}.0" processorArchitecture="amd64"/>
  <description>CINEVO</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security>
      <requestedPrivileges>
        <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
      </requestedPrivileges>
    </security>
  </trustInfo>
</assembly>`;
  const kept = res.entries.filter((entry) => Number(entry.type) !== 24);
  res.entries.length = 0;
  res.entries.push(...kept, {
    type: 24,
    id: 1,
    lang: 1033,
    bin: Buffer.from(manifest, "utf8"),
  });
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  console.log("embedded CINEVO icon + version in", path.basename(exePath));
}

function ensureJsign() {
  const jar = path.join(tools, "jsign.jar");
  if (fs.existsSync(jar) && fs.statSync(jar).size > 10_000) return jar;
  const urls = [
    "https://github.com/ebourg/jsign/releases/download/7.1/jsign-7.1.jar",
    "https://repo1.maven.org/maven2/net/jsign/jsign/7.1/jsign-7.1.jar",
    "https://repo1.maven.org/maven2/net/jsign/jsign/5.0/jsign-5.0.jar",
  ];
  for (const url of urls) {
    const got = spawnSync("curl", ["-fsSL", "-o", jar, url], { stdio: "inherit" });
    if (got.status === 0 && fs.existsSync(jar) && fs.statSync(jar).size > 10_000) {
      console.log("downloaded jsign", url);
      return jar;
    }
  }
  throw new Error("Could not download jsign for Authenticode signing");
}

function signWindows(exePath) {
  const certDir = path.join(tools, "certs");
  fs.mkdirSync(certDir, { recursive: true });
  const key = path.join(certDir, "cinevo-node.key");
  const crt = path.join(certDir, "cinevo-node.crt");
  const p12 = path.join(certDir, "cinevo-node.p12");
  if (!fs.existsSync(p12) || !fs.existsSync(crt) || !fs.existsSync(key)) {
    execFileSync("openssl", [
      "req",
      "-newkey",
      "rsa:4096",
      "-nodes",
      "-keyout",
      key,
      "-x509",
      "-days",
      "1825",
      "-sha256",
      "-out",
      crt,
      "-subj",
      "/CN=CINEVO/O=CDXI/OU=Fourtee2 Digital/C=AU",
      "-addext",
      "extendedKeyUsage=codeSigning",
      "-addext",
      "keyUsage=digitalSignature",
    ], { stdio: "inherit" });
    execFileSync("openssl", [
      "pkcs12",
      "-export",
      "-out",
      p12,
      "-inkey",
      key,
      "-in",
      crt,
      "-name",
      "cinevo",
      "-passout",
      "pass:cinevo-node",
    ], { stdio: "inherit" });
  }
  const jar = ensureJsign();
  const args = [
    "-jar",
    jar,
    "--keystore",
    p12,
    "--alias",
    "cinevo",
    "--storepass",
    "cinevo-node",
    "--storetype",
    "PKCS12",
    "--alg",
    "SHA-256",
    "--name",
    "CINEVO",
    "--url",
    "https://www.fourtee2.digital",
    exePath,
  ];
  const signed = spawnSync("java", args, { stdio: "inherit" });
  if (signed.status !== 0) {
    console.warn("jsign without timestamp failed; retrying with DigiCert TSA");
    execFileSync("java", [...args.slice(0, -1), "--tsaurl", "http://timestamp.digicert.com", exePath], {
      stdio: "inherit",
    });
  }
  const pe = fs.readFileSync(exePath);
  if (!pe.includes(Buffer.from("CINEVO Node")) && pe.length < 1000) {
    throw new Error("signed binary looks empty");
  }
  console.log("Authenticode-signed", path.basename(exePath));
}

const WIN_PS1 = `# CINEVO Node installer for Windows
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Dest = Join-Path $env:LOCALAPPDATA "CINEVO\\Node"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item -Force (Join-Path $Root "cinevo-node.exe") (Join-Path $Dest "cinevo-node.exe")
if (Test-Path (Join-Path $Root "icon.ico")) {
  Copy-Item -Force (Join-Path $Root "icon.ico") (Join-Path $Dest "icon.ico")
}
$Wsh = New-Object -ComObject WScript.Shell
$StartMenu = Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs\\CINEVO"
New-Item -ItemType Directory -Force -Path $StartMenu | Out-Null
$Shortcut = $Wsh.CreateShortcut((Join-Path $StartMenu "CINEVO Node.lnk"))
$Shortcut.TargetPath = Join-Path $Dest "cinevo-node.exe"
$Shortcut.WorkingDirectory = $Dest
$Shortcut.Description = "CINEVO Node — private loopback companion"
$Shortcut.IconLocation = (Join-Path $Dest "cinevo-node.exe") + ",0"
$Shortcut.Save()
Write-Host "Installed to $Dest"
Write-Host "Starting CINEVO Node on 127.0.0.1:48184"
Start-Process -FilePath (Join-Path $Dest "cinevo-node.exe")
`;

const WIN_BAT = `@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"
`;

const WIN_README = `CINEVO Node for Windows (x64)
==============================

Loopback-only companion. Binds 127.0.0.1:48184. Never forwards ports.
Never streams media. Plex / Jellyfin tokens stay on this PC.

The executable is named CINEVO in Windows, carries the CINEVO icon, and is
signed with the same CINEVO certificate on every build. It does not ask for
administrator rights. SmartScreen can still show one warning the first time,
because the certificate is not from a paid public CA. That warning is not a
virus detection. Choose "More info", then "Run anyway".

Install
  Double-click "Install CINEVO Node.bat"
  or: powershell -ExecutionPolicy Bypass -File install.ps1

Then open CINEVO and enter the pairing code shown in the dashboard.

Uninstall
  Quit CINEVO Node from Task Manager, then delete:
  %LOCALAPPDATA%\\CINEVO\\Node
`;

const MAC_INSTALL = `#!/bin/bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/CINEVO Node.app"
DEST="/Applications/CINEVO Node.app"
if [ ! -d "$APP" ]; then
  echo "CINEVO Node.app is missing from this folder." >&2
  exit 1
fi
rm -rf "$DEST"
cp -R "$APP" "$DEST"
chmod +x "$DEST/Contents/MacOS/cinevo-node" || true
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true
open "$DEST"
echo "CINEVO Node installed to /Applications and launched."
echo "Dashboard: http://127.0.0.1:48184"
`;

const MAC_README = `CINEVO Node for macOS
=====================

Loopback-only companion. Binds 127.0.0.1:48184.

The app includes the CINEVO icon (AppIcon.icns). The Mach-O binary is
signed by the packager. macOS Gatekeeper still requires Apple notarization
with a Developer ID for a silent first launch.

Install
  Double-click install.command
  or drag "CINEVO Node.app" into /Applications, then open it.

If macOS blocks it:
  System Settings → Privacy & Security → Open Anyway
  or: xattr -dr com.apple.quarantine "/Applications/CINEVO Node.app"

First launch opens the private dashboard with a 10-minute pairing code.
Enter that code in CINEVO on this Mac.
`;

function infoPlist(arch) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>CINEVO Node</string>
  <key>CFBundleDisplayName</key><string>CINEVO Node</string>
  <key>CFBundleIdentifier</key><string>im.cinevo.node</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleExecutable</key><string>cinevo-node</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundleIconName</key><string>AppIcon</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSArchitecturePriority</key>
  <array><string>${arch === "arm64" ? "arm64" : "x86_64"}</string></array>
</dict>
</plist>
`;
}

function wrapMac(binary, archLabel, arch) {
  const dir = path.join(dist, `mac-${archLabel}`, "CINEVO Node.app", "Contents");
  write(path.join(dir, "Info.plist"), infoPlist(arch));
  write(path.join(dir, "PkgInfo"), "APPL????");
  const exe = path.join(dir, "MacOS", "cinevo-node");
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.copyFileSync(binary, exe);
  fs.chmodSync(exe, 0o755);
  const resources = path.join(dir, "Resources");
  fs.mkdirSync(resources, { recursive: true });
  fs.copyFileSync(path.join(brand, "AppIcon.icns"), path.join(resources, "AppIcon.icns"));
  fs.copyFileSync(path.join(brand, "icon-256.png"), path.join(resources, "icon.png"));
  const ldid = path.join(tools, "ldid");
  if (fs.existsSync(ldid)) {
    execFileSync(ldid, ["-S", exe], { stdio: "inherit" });
    console.log("ad-hoc signed", exe);
  }
  write(path.join(dist, `mac-${archLabel}`, "install.command"), MAC_INSTALL, 0o755);
  write(path.join(dist, `mac-${archLabel}`, "README.txt"), MAC_README);
}

const LINUX_README = `CINEVO Node for Linux and NAS (x64)
=====================================

Private companion for a home server, Unraid, TrueNAS, Synology, or a
Linux PC. Files stay on this machine. Pairing is required.

This package listens on the home network (0.0.0.0:48184) so CINEVO on
another computer can reach it. Do not forward port 48184 to the internet.

Install
  Unzip, then:
    sudo sh install.sh

  Without root, the same script installs into your home folder.

Then open http://NAS-IP:48184 and enter the pairing code in CINEVO.

Uninstall
  sudo systemctl disable --now cinevo-node
  sudo rm -rf /opt/cinevo-node /etc/systemd/system/cinevo-node.service
  sudo systemctl daemon-reload
`;

const LINUX_SERVICE = `[Unit]
Description=CINEVO Node
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
Environment=CINEVO_NODE_HOST=0.0.0.0
Environment=CINEVO_NODE_PORT=48184
ExecStart=/opt/cinevo-node/cinevo-node --no-open
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

const LINUX_INSTALL = `#!/bin/sh
set -eu
HERE=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
BIN="$HERE/cinevo-node"
if [ ! -f "$BIN" ]; then
  echo "cinevo-node is missing from this folder." >&2
  exit 1
fi
if [ "$(uname -s)" != "Linux" ]; then
  echo "This installer is for Linux and NAS." >&2
  exit 1
fi
chmod 755 "$BIN"

install_unit() {
  dest="$1"
  unit="$2"
  sed "s#/opt/cinevo-node#$dest#g" "$HERE/cinevo-node.service" > "$unit"
}

if [ "$(id -u)" -eq 0 ]; then
  DEST=/opt/cinevo-node
  install -d -m 755 "$DEST"
  install -m 755 "$BIN" "$DEST/cinevo-node"
  if [ -f "$HERE/icon.png" ]; then install -m 644 "$HERE/icon.png" "$DEST/icon.png"; fi
  if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    install_unit "$DEST" /etc/systemd/system/cinevo-node.service
    systemctl daemon-reload
    systemctl enable --now cinevo-node.service
    echo "CINEVO Node service is running."
  else
    CINEVO_NODE_HOST=0.0.0.0 nohup "$DEST/cinevo-node" --no-open >/var/log/cinevo-node.log 2>&1 &
    echo "Started without systemd. Log: /var/log/cinevo-node.log"
  fi
else
  DEST="$HOME/.local/share/cinevo-node"
  mkdir -p "$DEST"
  cp "$BIN" "$DEST/cinevo-node"
  chmod 755 "$DEST/cinevo-node"
  if [ -f "$HERE/icon.png" ]; then cp "$HERE/icon.png" "$DEST/icon.png"; fi
  if command -v systemctl >/dev/null 2>&1; then
    mkdir -p "$HOME/.config/systemd/user"
    install_unit "$DEST" "$HOME/.config/systemd/user/cinevo-node.service"
    systemctl --user daemon-reload || true
    systemctl --user enable --now cinevo-node.service || CINEVO_NODE_HOST=0.0.0.0 nohup "$DEST/cinevo-node" --no-open >/tmp/cinevo-node.log 2>&1 &
  else
    CINEVO_NODE_HOST=0.0.0.0 nohup "$DEST/cinevo-node" --no-open >/tmp/cinevo-node.log 2>&1 &
  fi
  echo "Installed for $(id -un) at $DEST"
fi
DESKTOP_DIR="\${XDG_DATA_HOME:-\$HOME/.local/share}/applications"
mkdir -p "\$DESKTOP_DIR" 2>/dev/null || true
cat > "\$DESKTOP_DIR/CINEVO.desktop" << EOF
[Desktop Entry]
Type=Application
Name=CINEVO
GenericName=CINEVO Server
Comment=CINEVO server for this computer. A CDXI app, distributed as a Fourtee2 Digital project.
Exec=\$DEST/cinevo-node --no-open
Icon=\$DEST/icon.png
Terminal=false
Categories=AudioVideo;Network;
EOF
echo "Dashboard: http://THIS-MACHINE:48184"
echo "Pair that code in CINEVO. Do not port-forward 48184."
`;

function wrapLinux(binary) {
  const dir = path.join(dist, "linux-x64");
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(binary, path.join(dir, "cinevo-node"));
  fs.chmodSync(path.join(dir, "cinevo-node"), 0o755);
  fs.copyFileSync(path.join(brand, "icon-256.png"), path.join(dir, "icon.png"));
  write(path.join(dir, "cinevo-node.service"), LINUX_SERVICE);
  write(path.join(dir, "install.sh"), LINUX_INSTALL, 0o755);
  write(path.join(dir, "README.txt"), LINUX_README);
  return dir;
}

if (process.argv[2] === "--sign-exe") {
  const exePath = process.argv[3];
  if (!exePath) throw new Error("usage: node pack.mjs --sign-exe <cinevo-node.exe>");
  brandWindowsExe(exePath);
  signWindows(exePath);
  process.exit(0);
}

console.log("Packaging CINEVO Node executables…");
runPkg();

const produced = fs.readdirSync(dist);
console.log("pkg output", produced);

function findOut(fragment) {
  const hit = produced.find((f) => f.includes(fragment) && !f.endsWith(".zip"));
  if (!hit) throw new Error(`missing pkg output for ${fragment}`);
  return path.join(dist, hit);
}

const winExe = findOut("win-x64");
const macX64 = findOut("macos-x64");
const macArm = findOut("macos-arm64");
const linuxX64 = findOut("linux-x64");
verifyBinary(winExe, "pe");
verifyBinary(macX64, "macho");
verifyBinary(macArm, "macho");
verifyBinary(linuxX64, "elf");

brandWindowsExe(winExe);
signWindows(winExe);
verifyBinary(winExe, "pe");

const winDir = path.join(dist, "win-x64");
fs.mkdirSync(winDir, { recursive: true });
fs.copyFileSync(winExe, path.join(winDir, "cinevo-node.exe"));
fs.copyFileSync(path.join(brand, "icon.ico"), path.join(winDir, "icon.ico"));
fs.copyFileSync(path.join(brand, "icon-256.png"), path.join(winDir, "icon.png"));
write(path.join(winDir, "install.ps1"), WIN_PS1);
write(path.join(winDir, "Install CINEVO Node.bat"), WIN_BAT);
write(path.join(winDir, "README.txt"), WIN_README);

wrapMac(macArm, "arm64", "arm64");
wrapMac(macX64, "intel", "x86_64");
const linuxDir = wrapLinux(linuxX64);

const zips = [
  [winDir, path.join(out, "CINEVO-Node-Windows-x64.zip")],
  [path.join(dist, "mac-arm64"), path.join(out, "CINEVO-Node-macOS-Apple-Silicon.zip")],
  [path.join(dist, "mac-intel"), path.join(out, "CINEVO-Node-macOS-Intel.zip")],
  [linuxDir, path.join(out, "CINEVO-Node-Linux-x64.zip")],
];
for (const [src, zip] of zips) {
  zipDir(src, zip);
  console.log("wrote", zip, fs.statSync(zip).size, "bytes");
}

const manifest = {
  version: VERSION,
  builtAt: new Date().toISOString(),
  port: 48184,
  bind: "127.0.0.1",
  icon: "/node-icon.png",
  signed: {
    windows: "authenticode:CINEVO Node",
    mac: "ad-hoc Mach-O signature via ldid + AppIcon.icns",
    linux: "ELF x64 for Linux and NAS",
  },
  installers: {
    windowsX64: "/installers/CINEVO-Node-Windows-x64.zip",
    macAppleSilicon: "/installers/CINEVO-Node-macOS-Apple-Silicon.zip",
    macIntel: "/installers/CINEVO-Node-macOS-Intel.zip",
    linuxX64: "/installers/CINEVO-Node-Linux-x64.zip",
  },
};
fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("CINEVO Node installers ready.");
