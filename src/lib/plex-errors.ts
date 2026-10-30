/**
 * Plain messages for what Plex (or the path to it) actually said, so the player
 * stops reporting every failure as a codec problem. `status` 0 means no HTTP
 * answer at all: unreachable, blocked by CORS, a certificate error, or a timeout.
 */
export function plexStatusMessage(status: number, via: "direct" | "proxy" = "proxy") {
  if (status === 401) return "Plex did not accept the sign-in for this server (401). Reconnect Plex in Libraries.";
  if (status === 403)
    return "Plex refused this stream (403). Plex only allows remote streaming when the server owner or your Plex account has Plex Pass or a Remote Watch Pass. Playing on the server's home network still works.";
  if (status === 400) return "Plex could not prepare this title (400). Your server may not be able to convert it.";
  if (status === 404) return "Plex no longer has this title (404). Re-import the library.";
  if (status === 410) return "This playback link expired. Press play again.";
  if (status === 429) return "Your Plex server is busy (429). Try again in a moment.";
  if (status === 0)
    return via === "direct"
      ? "This browser could not reach your Plex server."
      : "CINEVO could not reach your Plex server from the internet. Turn on Remote Access in Plex, or play on the server's home network.";
  if (status >= 500) return `Your Plex server returned an error (${status}).`;
  return `Plex returned ${status}.`;
}

/** The status Plex gave the CINEVO proxy, from the header the stream route sets. */
export function upstreamStatus(details: unknown): number | null {
  const read = (name: string): string | null => {
    const d = details as { getResponseHeader?: (n: string) => string | null; headers?: { get?: (n: string) => string | null } } | null;
    if (!d) return null;
    try {
      if (typeof d.getResponseHeader === "function") return d.getResponseHeader(name);
      if (d.headers && typeof d.headers.get === "function") return d.headers.get(name);
    } catch {
      return null;
    }
    return null;
  };
  const raw = read("x-cinevo-upstream-status");
  if (raw === null || !/^\d{1,3}$/.test(raw)) return null;
  return Number(raw);
}
