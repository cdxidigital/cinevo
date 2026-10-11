import assert from "node:assert/strict";
import test from "node:test";
import { mediaEgressError, unsafeResolvedAddress } from "./media-egress.server.ts";

test("rejects private and mapped DNS records", async () => {
  assert.equal(
    await mediaEgressError("https://plex.example", async () => [{ address: "169.254.169.254", family: 4 }]),
    "That server address resolves to a restricted network.",
  );
  assert.equal(
    await mediaEgressError("https://plex.example", async () => [
      { address: "1.1.1.1", family: 4 }, { address: "127.0.0.1", family: 4 },
    ]),
    "That server address resolves to a restricted network.",
  );
  assert.equal(unsafeResolvedAddress("::ffff:127.0.0.1", 6), true);
});

test("accepts a DNS name resolving only to public IPv4/IPv6", async () => {
  assert.equal(
    await mediaEgressError("https://plex.example", async () => [
      { address: "8.8.8.8", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]),
    null,
  );
});

test("rejects static internal names without doing DNS and fails closed on resolution errors", async () => {
  assert.equal(
    await mediaEgressError("http://localhost:48184", async () => { throw new Error("should not be called"); }),
    "That server address is not allowed.",
  );
  assert.equal(
    await mediaEgressError("https://plex.example", async () => { throw new Error("NXDOMAIN"); }),
    "Could not verify that server address.",
  );
});
