import { lookup as dnsLookup } from "node:dns/promises";
import { ADDRESS_NOT_ALLOWED, blockedIpReason, hostLiteralError, parseV6 } from "./net-guard.ts";

export type Lookup = (host: string) => Promise<string[]>;

const LOOKUP_TIMEOUT_MS = 5_000;

const systemLookup: Lookup = async (host) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("dns timeout")), LOOKUP_TIMEOUT_MS);
  });
  try {
    const found = await Promise.race([dnsLookup(host, { all: true, verbatim: true }), timeout]);
    return found.map((a) => a.address);
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Full server-side check: the literal rules, then every address the name resolves
 * to. A name that does not resolve is refused too. Private ranges are refused
 * unless `allowPrivate`. Residual risk: fetch() resolves again, so a DNS answer
 * that changes between this check and the connect (rebinding) is not pinned.
 * plex.direct names are also checked by the IP they encode, which DNS can't change.
 */
export async function serverAddressCheck(
  uri: string,
  { allowPrivate = false, lookup = systemLookup }: { allowPrivate?: boolean; lookup?: Lookup } = {},
): Promise<string | null> {
  const literal = hostLiteralError(uri, { allowPrivate });
  if (literal) return literal;
  const host = new URL(uri).hostname.replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || parseV6(host)) return null;
  let addresses: string[];
  try {
    addresses = await lookup(host);
  } catch {
    return ADDRESS_NOT_ALLOWED;
  }
  if (!addresses.length) return ADDRESS_NOT_ALLOWED;
  for (const address of addresses) {
    if (blockedIpReason(address, { allowPrivate })) return ADDRESS_NOT_ALLOWED;
  }
  return null;
}
