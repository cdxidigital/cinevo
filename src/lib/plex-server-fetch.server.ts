import { fetchMedia, strictGuard, UpstreamError, type AddressGuard } from "./media-proxy.server.ts";

/**
 * JSON from a user's Plex Media Server (open, import, folder walk). Same rules as
 * the stream proxy: manual redirects, same host only, the strict address check
 * (DNS-resolved, no loopback, link-local, metadata or private ranges) on the
 * first URL and every hop, and a total timeout. The token header never leaves the
 * server's host. Errors are generic plus the status: the upstream body is never
 * echoed to the caller, because the host is caller-supplied. plex.tv calls don't
 * use this (they keep plexJson).
 */
export async function plexServerJson(url: string, headers: Record<string, string>, ms = 8000, guard: AddressGuard = strictGuard()): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchMedia(url, new Headers(headers), "GET", { guard, totalTimeoutMs: ms });
  } catch (err) {
    const kind = err instanceof UpstreamError ? err.kind : "network";
    if (kind === "blocked" || kind === "redirect") throw new Error("That server address is not allowed.");
    if (kind === "timeout") throw new Error("That Plex server took too long to answer.");
    throw new Error("Could not reach that Plex server from here.");
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`Plex server returned ${res.status}.`);
  }
  try {
    return (await res.json()) as unknown;
  } catch {
    throw new Error("That Plex server sent a reply CINEVO couldn't read.");
  }
}
