/**
 * Plex HLS through the CINEVO proxy. The ticket fixes the Plex host and the
 * transcode session; the browser may only name a path inside that one session's
 * folder (`/video/:/transcode/universal/session/<this ticket's session>/…`).
 * Host and address checks on every fetch and redirect hop live in
 * media-proxy.server.ts. No X-Plex-* parameter (the token included, in any
 * letter case) survives into a rewritten playlist or an upstream path; the
 * stream route adds the token as a header from the ticket.
 */
const PREFIX = "/video/:/transcode/universal/";
const SESSION_PREFIX = `${PREFIX}session/`;
const SAFE_SESSION = /^[A-Za-z0-9_-]{1,64}$/;

export function isPlexHlsTicket(url: string) {
  try {
    return new URL(url).pathname === `${PREFIX}start.m3u8`;
  } catch {
    return false;
  }
}

/** The transcode session a ticket was issued for, or null if it has none we can trust. */
export function plexTicketSession(ticketUrl: string): string | null {
  try {
    const session = new URL(ticketUrl).searchParams.get("session") || "";
    return SAFE_SESSION.test(session) ? session : null;
  } catch {
    return null;
  }
}

/** Remove every X-Plex-* query parameter, whatever its letter case. */
export function stripPlexParams(url: URL) {
  for (const name of [...url.searchParams.keys()]) {
    if (name.toLowerCase().startsWith("x-plex-")) url.searchParams.delete(name);
  }
}

function inSession(pathname: string, session: string) {
  return pathname.startsWith(`${SESSION_PREFIX}${session}/`);
}

/** Resolve a proxied `hls=` path against the ticket's Plex host and session, or refuse it. */
export function plexHlsUpstream(ticketUrl: string, rel: string): string | null {
  if (!rel || rel.length > 1024 || !rel.startsWith("/") || rel.startsWith("//")) return null;
  if (/[\\\s]/.test(rel)) return null;
  const session = plexTicketSession(ticketUrl);
  if (!session) return null;
  const q = rel.indexOf("?");
  const rawPath = q === -1 ? rel : rel.slice(0, q);
  // No percent-encoding at all in the path: that closes %2f, %5c, %2e and %252e
  // (double encoding) before any layer can decode them. Plex session paths never
  // need it. Literal dot segments are refused too, rather than normalised.
  if (rawPath.includes("%")) return null;
  if (rawPath.split("/").some((seg) => seg === "." || seg === "..")) return null;
  let base: URL;
  let next: URL;
  try {
    base = new URL(ticketUrl);
    next = new URL(rel, base.origin);
  } catch {
    return null;
  }
  if (next.origin !== base.origin) return null;
  if (!inSession(next.pathname, session)) return null;
  stripPlexParams(next);
  return next.toString();
}

function proxied(raw: string, base: URL, ticketId: string, session: string) {
  let abs: URL;
  try {
    abs = new URL(raw, base);
  } catch {
    return null;
  }
  if (abs.origin !== base.origin || !inSession(abs.pathname, session) || abs.pathname.includes("%")) return null;
  stripPlexParams(abs);
  return `/api/stream/${ticketId}?hls=${encodeURIComponent(`${abs.pathname}${abs.search}`)}`;
}

/** Tags that describe the next URI line; they go if that URI is dropped. */
const URI_TAGS = /^#(EXTINF|EXT-X-BYTERANGE|EXT-X-STREAM-INF|EXT-X-PROGRAM-DATE-TIME|EXT-X-DISCONTINUITY|EXT-X-GAP|EXT-X-BITRATE)\b/i;

/**
 * Point every playlist and segment URI at this ticket. A segment or variant off
 * the session folder is dropped together with its tags (#EXTINF and friends). A
 * tag that names a foreign URI (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA…) means the
 * playlist can't be trusted, so the whole playlist is refused (null).
 */
export function rewritePlexPlaylist(body: string, upstreamUrl: string, ticketId: string, session: string): string | null {
  const base = new URL(upstreamUrl);
  const out: string[] = [];
  let pending: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      (pending.length ? pending : out).push(line);
      continue;
    }
    if (trimmed.startsWith("#")) {
      let foreign = false;
      const rewritten = line.replace(/URI="([^"]*)"/gi, (_whole, uri: string) => {
        const next = proxied(uri, base, ticketId, session);
        if (!next) foreign = true;
        return `URI="${next ?? ""}"`;
      });
      if (foreign) return null;
      // Once a URI's tags have started, keep later tags in order with them.
      if (pending.length || URI_TAGS.test(trimmed)) pending.push(rewritten);
      else out.push(rewritten);
      continue;
    }
    const next = proxied(trimmed, base, ticketId, session);
    if (next) out.push(...pending, next);
    else out.push(...pending.filter((tag) => !URI_TAGS.test(tag.trim())));
    pending = [];
  }
  out.push(...pending.filter((tag) => !URI_TAGS.test(tag.trim())));
  return out.join("\n");
}
