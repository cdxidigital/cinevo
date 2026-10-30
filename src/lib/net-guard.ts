/**
 * Address rules for anything the server fetches on a user's behalf. Pure (no DNS),
 * so the client bundle can import it too; the DNS half is net-guard.server.ts.
 *
 * Always blocked: loopback (127/8, ::1, IPv4-mapped and NAT64 forms), unspecified
 * (0.0.0.0/8, ::), link-local (169.254/16 including the AWS/ECS 169.254.170.2 and
 * metadata 169.254.169.254, fe80::/10, deprecated site-local fec0::/10), CGNAT 100.64/10 (Alibaba metadata
 * 100.100.100.200), multicast and reserved, and named metadata hosts.
 * Private ranges (10/8, 172.16/12, 192.168/16, fc00::/7) are blocked unless the
 * caller allows them: the Vercel-side Plex proxy never allows them, because a
 * function cannot reach a home network anyway.
 */
export const ADDRESS_NOT_ALLOWED = "That server address is not allowed.";

type V4 = [number, number, number, number];

function parseV4(text: string): V4 | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out as V4;
}

/** Expand an IPv6 literal (no brackets) to 8 hextets, or null. Handles a dotted IPv4 tail. */
export function parseV6(text: string): number[] | null {
  let s = text.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!s.includes(":")) return null;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (tail) {
    const v4 = parseV4(tail[1]);
    if (!v4) return null;
    s = s.slice(0, -tail[1].length) + `${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const read = (part: string) => (part ? part.split(":") : []);
  const head = read(halves[0]);
  const rest = halves.length === 2 ? read(halves[1]) : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function v4Reason(v: V4, allowPrivate: boolean): string | null {
  const [a, b] = v;
  if (a === 0) return "unspecified";
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "link-local";
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";
  if (a >= 224) return "multicast-or-reserved";
  if (a === 192 && b === 0 && v[2] === 0) return "reserved";
  if (a === 198 && (b === 18 || b === 19)) return "reserved";
  if (!allowPrivate && (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))) return "private";
  return null;
}

/** Why an IP literal is refused, or null if it's fine. */
export function blockedIpReason(ip: string, { allowPrivate = false } = {}): string | null {
  const v4 = parseV4(ip);
  if (v4) return v4Reason(v4, allowPrivate);
  const v6 = parseV6(ip);
  if (!v6) return null;
  const zeroHead = (n: number) => v6.slice(0, n).every((g) => g === 0);
  const embedded = (): V4 => [v6[6] >> 8, v6[6] & 255, v6[7] >> 8, v6[7] & 255];
  if (v6.every((g) => g === 0)) return "unspecified";
  if (zeroHead(7) && v6[7] === 1) return "loopback";
  // ::ffff:a.b.c.d (mapped), ::a.b.c.d (compatible), 64:ff9b::a.b.c.d (NAT64), ::ffff:0:a.b.c.d
  if ((zeroHead(5) && v6[5] === 0xffff) || zeroHead(6) || (zeroHead(4) && v6[4] === 0xffff && v6[5] === 0)) {
    return v4Reason(embedded(), allowPrivate) ?? (zeroHead(6) ? "reserved" : null);
  }
  if (v6[0] === 0x64 && v6[1] === 0xff9b && v6.slice(2, 6).every((g) => g === 0)) return v4Reason(embedded(), allowPrivate);
  if ((v6[0] & 0xffc0) === 0xfe80) return "link-local";
  if ((v6[0] & 0xffc0) === 0xfec0) return "site-local";
  if ((v6[0] & 0xff00) === 0xff00) return "multicast-or-reserved";
  if ((v6[0] & 0xfe00) === 0xfc00) return allowPrivate && !(v6[0] === 0xfd00 && v6[1] === 0x0ec2) ? null : "private";
  return null;
}

export function isLoopbackIp(host: string) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (name === "localhost" || name.endsWith(".localhost")) return true;
  const reason = blockedIpReason(name, { allowPrivate: true });
  return reason === "loopback" || reason === "unspecified";
}

/** The IP a plex.direct name encodes: `192-168-1-5.<hash>.plex.direct` or the v6 dashed form. */
export function plexDirectIp(hostname: string): string | null {
  const m = /^([0-9a-f-]+)\.[0-9a-f]+\.plex\.direct$/i.exec(hostname);
  if (!m) return null;
  const label = m[1];
  if (/^\d{1,3}(-\d{1,3}){3}$/.test(label)) return label.replace(/-/g, ".");
  const v6 = label.replace(/-/g, ":");
  return parseV6(v6) ? v6 : null;
}

const BLOCKED_NAMES = new Set(["localhost", "metadata.google.internal", "metadata.google", "metadata", "instance-data"]);

/**
 * Checks the URL without DNS: scheme, credentials, IP literals, plex.direct-encoded
 * IPs and named metadata hosts. Returns an error message or null.
 */
export function hostLiteralError(uri: string, { allowPrivate = false } = {}): string | null {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return ADDRESS_NOT_ALLOWED;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return ADDRESS_NOT_ALLOWED;
  if (url.username || url.password) return ADDRESS_NOT_ALLOWED;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host || BLOCKED_NAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) return ADDRESS_NOT_ALLOWED;
  if (blockedIpReason(host, { allowPrivate })) return ADDRESS_NOT_ALLOWED;
  const encoded = plexDirectIp(host);
  if (encoded && blockedIpReason(encoded, { allowPrivate })) return ADDRESS_NOT_ALLOWED;
  return null;
}
