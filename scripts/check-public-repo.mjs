#!/usr/bin/env node
/**
 * Fail release/CI checks if source control tracks private signing material.
 * A .gitignore entry alone does not untrack an already committed secret.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const paths = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean);
const forbiddenExtension = /\.(?:jks|keystore|p12|pfx|key|pem)$/i;
const exposed = [];
for (const path of paths) {
  if (forbiddenExtension.test(path)) {
    exposed.push(path);
    continue;
  }
  if (!/\.(?:ts|tsx|js|mjs|cjs|sh|json|yml|yaml|md|txt|env)$/i.test(path)) continue;
  if (/\.(?:test|spec)\./i.test(path) || path.startsWith(".grok/")) continue;
  let content = "";
  try {
    content = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(content)) exposed.push(path);
}
// Old native packages must not reappear while signing credentials are under
// rotation. This also covers accidental re-adds despite .gitignore.
const releaseManifest = "public/installers/manifest.json";
try {
  const manifest = JSON.parse(readFileSync(releaseManifest, "utf8"));
  if (manifest.status === "release-security-hold") {
    for (const path of paths) {
      if (/^public\/installers\/[^/]+\.(?:apk|zip|exe|dmg|msi)$/i.test(path)) exposed.push(path);
    }
  }
} catch {
  exposed.push(releaseManifest);
}

if (exposed.length) {
  console.error("Tracked private signing material detected. Remove these files from Git tracking:");
  for (const path of exposed) console.error(" -", path);
  process.exitCode = 1;
} else {
  console.log("Public repository signing-material check passed.");
}
