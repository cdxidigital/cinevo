import { isLoopbackIp } from "./net-guard.ts";
import { serverAddressCheck, type Lookup } from "./net-guard.server.ts";
import { plexStatusMessage } from "./plex-errors.ts";
import { plexHlsUpstream, plexTicketSession, rewritePlexPlaylist } from "./plex-hls.ts";

export type AddressGuard = (url: string) => Promise<string | null>;

export type UpstreamErrorKind = "blocked" | "redirect" | "timeout" | "network" | "too-large";

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  constructor(kind: UpstreamErrorKind) {
    super(kind);
    this.kind = kind;
  }
}

/** The Vercel-side Plex proxy: DNS-resolved, no loopback, link-local, metadata or private ranges. */
export const strictGuard = (lookup?: Lookup): AddressGuard => (url) => serverAddressCheck(url, { allowPrivate: false, lookup });

export type FetchMediaOptions = {
  /** Checked on the first URL and on every redirect hop. */
  guard: AddressGuard;
  /** Whole-response budget (headers and body). For playlists and segments. */
  totalTimeoutMs?: number;
  /** Budget until response headers arrive. For long streams where the body may run on. */
  headerTimeoutMs?: number;
  maxHops?: number;
};

/**
 * May a redirect from `current` (a hop that started at `origin`) go to `next`?
 * Same hostname and the same port. The one exception is the default-port upgrade:
 * http://host (port 80, none written) to https://host (443, none written). Never
 * a downgrade from https.
 */
export function sameHostRedirect(origin: URL, current: URL, next: URL) {
  if (next.username || next.password) return false;
  if (next.protocol !== "http:" && next.protocol !== "https:") return false;
  if (current.protocol === "https:" && next.protocol !== "https:") return false;
  if (next.hostname !== origin.hostname) return false;
  if (next.port === origin.port) return true;
  return origin.protocol === "http:" && !origin.port && next.protocol === "https:" && !next.port;
}

/** Node and Jellyfin: the LAN is allowed, but DNS is resolved and loopback, link-local and metadata are refused. */
export const lanGuard = (lookup?: Lookup): AddressGuard => (url) => serverAddressCheck(url, { allowPrivate: true, lookup });

/**
 * Fetch with manual redirects. A hop is followed only if it stays on the same
 * host (hostname and port; http→https only on the same port, or 80→443 with
 * neither written; never a downgrade) and passes
 * the address guard again. A redirect that points at Plex's own loopback is
 * rewritten back onto the public host first (a known Plex quirk). Anything
 * else is refused with UpstreamError("redirect"): the token never leaves the
 * ticket's host.
 */
export async function fetchMedia(url: string, headers: Headers, method: "GET" | "HEAD", opts: FetchMediaOptions): Promise<Response> {
  const origin = new URL(url);
  let current = new URL(url);
  const maxHops = opts.maxHops ?? 4;
  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (await opts.guard(current.toString())) throw new UpstreamError("blocked");
    const ctrl = new AbortController();
    const signals = [ctrl.signal];
    if (opts.totalTimeoutMs) signals.push(AbortSignal.timeout(opts.totalTimeoutMs));
    const timer = opts.headerTimeoutMs ? setTimeout(() => ctrl.abort(), opts.headerTimeoutMs) : undefined;
    let upstream: Response;
    try {
      upstream = await fetch(current, { method, headers, redirect: "manual", signal: AbortSignal.any(signals) });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      throw new UpstreamError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "network");
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (upstream.status < 300 || upstream.status >= 400) return upstream;
    const location = upstream.headers.get("location");
    await upstream.body?.cancel().catch(() => undefined);
    if (!location) return upstream;
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new UpstreamError("redirect");
    }
    if (isLoopbackIp(next.hostname) && !isLoopbackIp(origin.hostname)) {
      next.protocol = current.protocol;
      next.host = current.host;
    }
    if (!sameHostRedirect(origin, current, next)) throw new UpstreamError("redirect");
    current = next;
  }
  throw new UpstreamError("redirect");
}

export const PLAYLIST_MAX_BYTES = 2 * 1024 * 1024;
const PLAYLIST_TYPES = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "audio/x-mpegurl"]);
const SEGMENT_TYPES = new Set(["video/mp2t", "video/mp4", "video/iso.segment", "audio/mp4", "audio/aac", "audio/mpeg", "text/vtt", "application/octet-stream"]);
export const PLAYLIST_TIMEOUT_MS = 10_000;
export const SEGMENT_TIMEOUT_MS = 45_000;

function baseType(type: string) {
  return type.split(";")[0].trim().toLowerCase();
}

async function readCapped(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      throw new UpstreamError("too-large");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

const SECURE = { "X-Content-Type-Options": "nosniff" } as const;

export function plexFailure(status: number) {
  // Status only. Never the URL, which names the server, or the token.
  console.error("[stream] plex upstream failed", { status });
  return new Response(plexStatusMessage(status, "proxy"), {
    status: 502,
    headers: {
      ...SECURE,
      "Content-Type": "text/plain;charset=UTF-8",
      "Cache-Control": "no-store",
      "X-Cinevo-Upstream-Status": String(status),
    },
  });
}

function refused(message: string, status = 403) {
  return new Response(message, { status, headers: { ...SECURE, "Content-Type": "text/plain;charset=UTF-8", "Cache-Control": "no-store" } });
}

/**
 * Plex HLS: each request is one playlist or one segment, each with its own
 * timeout, so no response outlives the function. Range is deliberately not
 * forwarded: hls.js fetches whole .ts segments and Plex's transcoder output
 * is not byte-addressable.
 */
export async function servePlexHls(
  ticket: { url: string; headers: Record<string, string> },
  ticketId: string,
  rel: string | null,
  guard: AddressGuard = strictGuard(),
): Promise<Response> {
  const session = plexTicketSession(ticket.url);
  if (!session) return refused("This playback link has no transcode session.", 400);
  const target = rel === null ? ticket.url : plexHlsUpstream(ticket.url, rel);
  if (!target) return refused("That stream path is not allowed.", 400);
  const isPlaylistPath = rel === null || new URL(target).pathname.endsWith(".m3u8");
  const headers = new Headers(ticket.headers);
  headers.set("Accept-Encoding", "identity");
  let upstream: Response;
  try {
    upstream = await fetchMedia(target, headers, "GET", {
      guard,
      totalTimeoutMs: isPlaylistPath ? PLAYLIST_TIMEOUT_MS : SEGMENT_TIMEOUT_MS,
    });
  } catch (err) {
    const kind = err instanceof UpstreamError ? err.kind : "network";
    if (kind === "blocked" || kind === "redirect") {
      console.error("[stream] plex upstream refused", { kind });
      return refused("That server address is not allowed.");
    }
    return plexFailure(0);
  }
  if (!upstream.ok) {
    await upstream.body?.cancel().catch(() => undefined);
    return plexFailure(upstream.status);
  }
  const type = baseType(upstream.headers.get("content-type") || "");
  if (PLAYLIST_TYPES.has(type) || (isPlaylistPath && (!type || type === "text/plain"))) {
    let text: string;
    try {
      text = await readCapped(upstream, PLAYLIST_MAX_BYTES);
    } catch {
      return plexFailure(0);
    }
    if (!text.trimStart().startsWith("#EXTM3U")) return plexFailure(upstream.status);
    const rewritten = rewritePlexPlaylist(text, target, ticketId, session);
    if (rewritten === null) return refused("The media server sent a playlist that points outside this stream.", 502);
    return new Response(rewritten, {
      status: 200,
      headers: { ...SECURE, "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" },
    });
  }
  const segmentType = type || (/\.ts$/i.test(new URL(target).pathname) ? "video/mp2t" : "");
  if (!SEGMENT_TYPES.has(segmentType)) {
    await upstream.body?.cancel().catch(() => undefined);
    return refused("The media server did not return a media segment.", 502);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { ...SECURE, "Content-Type": segmentType, "Cache-Control": "private, max-age=3600" },
  });
}
