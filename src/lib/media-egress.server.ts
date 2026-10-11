import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { serverAddressError } from "./playback-urls.ts";

/**
 * Cloud egress defence in depth. Reject DNS names resolving to private,
 * loopback, link-local, metadata, mapped IPv4, multicast or reserved addresses.
 * A network egress firewall is still required to close DNS rebinding races.
 */
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7],
  ["fe80::", 10], ["ff00::", 8], ["2001:db8::", 32],
] as const) blocked.addSubnet(address, prefix, "ipv6");

export function unsafeResolvedAddress(address: string, family: number): boolean {
  if (family !== 4 && family !== 6) return true;
  if (isIP(address) !== family) return true;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) return true;
  return blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

type Resolved = { address: string; family: number };
type Resolve = (hostname: string) => Promise<Resolved[]>;

export async function mediaEgressError(
  uri: string,
  resolve: Resolve = (hostname) => lookup(hostname, { all: true }),
): Promise<string | null> {
  const invalid = serverAddressError(uri);
  if (invalid) return invalid;
  const hostname = new URL(uri).hostname;
  try {
    const addresses = await resolve(hostname);
    if (!addresses.length || addresses.some((item) => unsafeResolvedAddress(item.address, item.family))) {
      return "That server address resolves to a restricted network.";
    }
  } catch {
    return "Could not verify that server address.";
  }
  return null;
}

export async function assertSafeMediaEgress(uri: string): Promise<void> {
  const message = await mediaEgressError(uri);
  if (message) throw new Error(message);
}
