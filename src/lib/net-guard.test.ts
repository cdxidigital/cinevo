import assert from "node:assert/strict";
import test from "node:test";
import { blockedIpReason, hostLiteralError, isLoopbackIp, plexDirectIp } from "./net-guard.ts";
import { serverAddressCheck } from "./net-guard.server.ts";
import { serverAddressError } from "./playback-urls.ts";

const ALWAYS_BLOCKED = [
  "http://127.0.0.1:9001",
  "http://127.0.0.3",
  "http://0.0.0.0:32400",
  "http://0.1.2.3",
  "http://[::1]:32400",
  "http://[::]:32400",
  "http://[::ffff:7f00:1]:32400",
  "http://[::ffff:127.0.0.1]:32400",
  "http://[0:0:0:0:0:ffff:7f00:0001]",
  "http://[::127.0.0.1]",
  "http://[64:ff9b::7f00:1]",
  "http://[::ffff:169.254.169.254]",
  "http://169.254.169.254/latest/meta-data",
  "http://169.254.170.2/v2/credentials",
  "http://100.100.100.200",
  "http://[fe80::1]",
  "http://[fec0::1]",
  "http://[feff::1]",
  "http://[fd00:ec2::254]",
  "http://localhost:32400",
  "http://foo.localhost",
  "http://metadata.google.internal",
  "http://x.internal",
  "http://127-0-0-1.abc123.plex.direct:32400",
  "http://0-0-0-0.abc123.plex.direct:32400",
  "http://169-254-169-254.abc123.plex.direct:32400",
  "http://user:pw@example.com",
  "file:///etc/passwd",
  "gopher://example.com",
];

const PRIVATE = ["http://10.0.0.5:32400", "http://172.16.1.1", "http://192.168.1.5:32400", "http://192-168-1-5.abc123.plex.direct:32400", "http://[fd12::5]", "http://[::ffff:10.0.0.5]"];

test("loopback, unspecified, link-local and metadata addresses are refused even when private is allowed (Priya: serverAddressError)", () => {
  for (const u of ALWAYS_BLOCKED) {
    assert.ok(hostLiteralError(u, { allowPrivate: true }), u);
    assert.ok(serverAddressError(u), u);
  }
});

test("private ranges: allowed for the LAN-capable sync check, refused for the Vercel proxy", () => {
  for (const u of PRIVATE) {
    assert.equal(hostLiteralError(u, { allowPrivate: true }), null, u);
    assert.ok(hostLiteralError(u, { allowPrivate: false }), u);
  }
});

test("public hosts pass", () => {
  for (const u of ["https://203-0-113-9.abc123.plex.direct:32400", "https://8.8.8.8", "https://[2001:db8::1]:32400", "https://plex.example.com"]) {
    assert.equal(hostLiteralError(u), null, u);
  }
});

test("helpers", () => {
  assert.equal(isLoopbackIp("[::ffff:7f00:1]"), true);
  assert.equal(isLoopbackIp("127.9.9.9"), true);
  assert.equal(isLoopbackIp("0.0.0.0"), true);
  assert.equal(isLoopbackIp("192.168.1.5"), false);
  assert.equal(plexDirectIp("192-168-1-5.abc.plex.direct"), "192.168.1.5");
  assert.equal(plexDirectIp("plex.example.com"), null);
  assert.equal(blockedIpReason("169.254.170.2"), "link-local");
  assert.equal(blockedIpReason("::ffff:7f00:1"), "loopback");
});

test("DNS: a name that resolves to loopback, private or metadata is refused (plex.direct rebinding, custom domains)", async () => {
  const answers: Record<string, string[]> = {
    "loop.example": ["127.0.0.1"],
    "mapped.example": ["::ffff:127.0.0.1"],
    "lan.example": ["93.184.216.34", "192.168.1.5"],
    "meta.example": ["169.254.169.254"],
    "ok.example": ["93.184.216.34", "2606:2800:220:1::1"],
    "abcd-0-0-1.abc.plex.direct": ["10.0.0.1"],
  };
  const lookup = async (host: string) => {
    if (!(host in answers)) throw new Error("ENOTFOUND");
    return answers[host];
  };
  for (const host of ["loop.example", "mapped.example", "lan.example", "meta.example", "abcd-0-0-1.abc.plex.direct", "missing.example"]) {
    assert.ok(await serverAddressCheck(`https://${host}:32400`, { lookup }), host);
  }
  assert.equal(await serverAddressCheck("https://ok.example:32400", { lookup }), null);
  assert.equal(await serverAddressCheck("https://lan.example:32400", { lookup, allowPrivate: true }), null);
  assert.ok(await serverAddressCheck("http://127.0.0.1", { lookup }));
  assert.ok(await serverAddressCheck("https://site.example", { lookup: async () => ["fec0::1"] }));
});

test("Jellyfin/Node (LAN allowed) still resolves DNS: localtest.me, nip.io and rbndr names are refused (Priya)", async () => {
  const { lanGuard } = await import("./media-proxy.server.ts");
  const answers: Record<string, string[]> = {
    "localtest.me": ["127.0.0.1"],
    "127.0.0.1.nip.io": ["127.0.0.1"],
    "169.254.169.254.nip.io": ["169.254.169.254"],
    "7f000001.rbndr.us": ["127.0.0.1"],
    "nas.example": ["192.168.1.20"],
    "jellyfin.example": ["93.184.216.34"],
  };
  const guard = lanGuard(async (host) => answers[host] ?? Promise.reject(new Error("ENOTFOUND")));
  for (const u of ["http://localtest.me:9001/", "http://127.0.0.1.nip.io:9001/", "http://169.254.169.254.nip.io/", "http://7f000001.rbndr.us/"]) {
    assert.equal(hostLiteralError(u, { allowPrivate: true }), null, `${u} passes the literal check alone`);
    assert.ok(await guard(u), u);
  }
  assert.equal(await guard("http://nas.example:8096"), null);
  assert.equal(await guard("https://jellyfin.example"), null);
});
