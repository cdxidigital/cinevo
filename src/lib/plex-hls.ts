/**
 * Plex HLS through the CINEVO proxy. The ticket fixes the Plex host; the browser
 * only ever names a path under that host's transcode session tree, so the proxy
 * cannot be pointed at any other address. The token never appears in a
 * rewritten URL; the stream route adds it as a header from the ticket.
 */
const PREFIX = "/video/:/transcode/universal/";
const SESSION_PREFIX = `${PREFIX}session/`;

export function isPlexHlsTicket(url: string) {
  try {
    return new URL(url).pathname === `${PREFIX}start.m3u8`;
  } catch {
    return false;
  }
}

/** Resolve a proxied `hls=` path against the ticket's Plex host, or refuse it. */
export function plexHlsUpstream(ticketUrl: string, rel: string): string | null {
  if (!rel || rel.length > 1024 || !rel.startsWith("/") || rel.startsWith("//") || /[\\\s]/.test(rel)) return null;
  let base: URL;
  let next: URL;
  try {
    base = new URL(ticketUrl);
    next = new URL(rel, base.origin);
  } catch {
    return null;
  }
  if (next.origin !== base.origin) return null;
  if (!next.pathname.startsWith(SESSION_PREFIX)) return null;
  next.searchParams.delete("X-Plex-Token");
  return next.toString();
}

function proxied(raw: string, base: URL, ticketId: string) {
  let abs: URL;
  try {
    abs = new URL(raw, base);
  } catch {
    return null;
  }
  if (abs.origin !== base.origin || !abs.pathname.startsWith(SESSION_PREFIX)) return null;
  abs.searchParams.delete("X-Plex-Token");
  return `/api/stream/${ticketId}?hls=${encodeURIComponent(`${abs.pathname}${abs.search}`)}`;
}

/** Point every playlist and segment URI at this ticket. Anything off the session tree is dropped. */
export function rewritePlexPlaylist(body: string, upstreamUrl: string, ticketId: string) {
  const base = new URL(upstreamUrl);
  const out: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      out.push(line);
      continue;
    }
    if (trimmed.startsWith("#")) {
      out.push(
        line.replace(/URI="([^"]*)"/g, (whole, uri: string) => {
          const next = proxied(uri, base, ticketId);
          return next ? `URI="${next}"` : 'URI=""';
        }),
      );
      continue;
    }
    const next = proxied(trimmed, base, ticketId);
    if (next) out.push(next);
  }
  return out.join("\n");
}
