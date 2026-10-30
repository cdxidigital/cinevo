import { createFileRoute } from "@tanstack/react-router";
import { convertSegmentUrl, rewriteConvertPlaylist } from "@/lib/convert";
import { loadTicket } from "@/lib/playback.server";
import { isPlexHlsTicket } from "@/lib/plex-hls";
import { fetchMedia, lanGuard, servePlexHls, type AddressGuard } from "@/lib/media-proxy.server";

/**
 * Vercel function settings for this route are not set here: TanStack Start has no
 * per-route `maxDuration` export. They're set in vite.config.ts through Nitro's
 * `vercel.functionRules["/api/stream/**"]`, which gives /api/stream its own
 * function with an explicit maxDuration.
 */

function isLiveTranscode(url: string) {
  return url.includes("/transcode/") || /[?&]static=false/i.test(url);
}

function isVideoResponse(status: number, type: string) {
  if (status !== 200 && status !== 206) return false;
  if (!type) return true;
  return !/xml|html|json|text\/plain|mpegurl|m3u8/i.test(type);
}

function upstreamHeaders(ticketHeaders: Record<string, string>, range: string) {
  const headers = new Headers(ticketHeaders);
  headers.set("Accept-Encoding", "identity");
  if (range) headers.set("Range", range);
  return headers;
}

/**
 * Node and Jellyfin tickets may point at a LAN address (a CINEVO Node on the
 * same machine as a self-hosted house), so they keep private ranges but still
 * refuse loopback, link-local and metadata hosts, after DNS (so names like
 * localtest.me or 127.0.0.1.nip.io are caught), on the first URL and every hop.
 */
const lenientGuard: AddressGuard = lanGuard();
const LEGACY_HEADER_TIMEOUT_MS = 15_000;

function legacyFetch(url: string, headers: Headers, method: "GET" | "HEAD") {
  return fetchMedia(url, headers, method, { guard: lenientGuard, headerTimeoutMs: LEGACY_HEADER_TIMEOUT_MS });
}

function passHeaders(upstream: Response, download: boolean, live: boolean) {
  const out = new Headers();
  for (const key of ["content-type", "content-length", "content-range", "accept-ranges", "content-disposition"]) {
    const value = upstream.headers.get(key);
    if (value) out.set(key, value);
  }
  if (live) {
    out.delete("content-range");
    out.set("Accept-Ranges", "none");
  } else if (!out.has("Accept-Ranges")) out.set("Accept-Ranges", "bytes");
  if (!out.has("Content-Type")) out.set("Content-Type", "video/mp4");
  out.set("Cache-Control", "private, no-transform, max-age=7200");
  if (download) out.set("Content-Disposition", 'attachment; filename="cinevo-original.mp4"');
  return out;
}

export const Route = createFileRoute("/api/stream/$ticket")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const ticket = await loadTicket(params.ticket);
        if (!ticket) return new Response("Playback expired", { status: 410 });
        const requestUrl = new URL(request.url);
        if (isPlexHlsTicket(ticket.url)) return servePlexHls(ticket, params.ticket, requestUrl.searchParams.get("hls"));
        const seg = requestUrl.searchParams.get("seg");
        if (seg !== null && /^\d+$/.test(seg)) {
          try {
            const target = convertSegmentUrl(ticket.url, seg);
            const upstreamUrl = requestUrl.searchParams.get("whole") === "1" ? `${target}${target.includes("?") ? "&" : "?"}whole=1` : target;
            const upstream = await legacyFetch(upstreamUrl, upstreamHeaders(ticket.headers, ""), "GET");
            const type = upstream.headers.get("content-type") || "";
            if (!upstream.ok || /json|html|xml|plain/i.test(type)) {
              return new Response("CINEVO could not convert that part of the file.", { status: 502 });
            }
            return new Response(upstream.body, {
              status: 200,
              headers: {
                "Content-Type": "video/mp2t",
                "Cache-Control": "private, max-age=86400",
              },
            });
          } catch {
            return new Response("CINEVO could not reach that media server.", { status: 502 });
          }
        }
        const download = requestUrl.searchParams.get("download") === "1";
        const live = isLiveTranscode(ticket.url);
        const range = live ? "" : request.headers.get("range") || "";
        let upstream: Response;
        try {
          upstream = await legacyFetch(ticket.url, upstreamHeaders(ticket.headers, range), "GET");
          const type = upstream.headers.get("content-type") || "";
          if (range && !isVideoResponse(upstream.status, type)) {
            await upstream.body?.cancel();
            upstream = await legacyFetch(ticket.url, upstreamHeaders(ticket.headers, ""), "GET");
          }
        } catch {
          return new Response("CINEVO could not reach that media server.", { status: 502 });
        }
        const type = upstream.headers.get("content-type") || "";
        if (/mpegurl|m3u8/i.test(type) || (ticket.url.includes("fit=compatible") && upstream.ok)) {
          const text = await upstream.text();
          if (text.trimStart().startsWith("#EXTM3U")) {
            return new Response(rewriteConvertPlaylist(text, params.ticket), {
              status: 200,
              headers: {
                "Content-Type": "application/vnd.apple.mpegurl",
                "Cache-Control": "private, no-store",
              },
            });
          }
          return new Response("CINEVO could not build a browser copy of this file.", { status: 502 });
        }
        if (!isVideoResponse(upstream.status, type)) {
          return new Response("The media server did not return a video stream.", { status: 502 });
        }
        return new Response(upstream.body, {
          status: upstream.status === 206 && live ? 200 : upstream.status,
          headers: passHeaders(upstream, download, live),
        });
      },
      HEAD: async ({ request, params }) => {
        const ticket = await loadTicket(params.ticket);
        if (!ticket) return new Response(null, { status: 410 });
        // Starting a Plex transcode for a HEAD probe would leave a session running.
        if (isPlexHlsTicket(ticket.url)) {
          return new Response(null, { status: 200, headers: { "Content-Type": "application/vnd.apple.mpegurl", "Cache-Control": "private, no-store" } });
        }
        const range = isLiveTranscode(ticket.url) ? "" : request.headers.get("range") || "";
        try {
          let upstream = await legacyFetch(ticket.url, upstreamHeaders(ticket.headers, range), "HEAD");
          if ((upstream.status === 405 || upstream.status === 501) && !isLiveTranscode(ticket.url)) {
            upstream = await legacyFetch(ticket.url, upstreamHeaders(ticket.headers, range || "bytes=0-1"), "GET");
            await upstream.body?.cancel();
          }
          if (upstream.status !== 200 && upstream.status !== 206) {
            return new Response(null, { status: 502 });
          }
          return new Response(null, { status: upstream.status, headers: passHeaders(upstream, false, isLiveTranscode(ticket.url)) });
        } catch {
          return new Response(null, { status: 502 });
        }
      },
    },
  },
});
