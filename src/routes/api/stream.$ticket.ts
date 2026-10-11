import { createFileRoute } from "@tanstack/react-router";
import { convertSegmentUrl, rewriteConvertPlaylist } from "@/lib/convert";
import { loadTicket } from "@/lib/playback.server";

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

function isLoopbackHost(host: string) {
  const name = host.toLowerCase().replace(/^\[|\]$/g, "");
  return name === "localhost" || name === "127.0.0.1" || name === "::1" || name === "0.0.0.0";
}

/** Plex sometimes redirects a transcode at its own loopback. Keep the public host. */
function rewriteLoopback(next: string, origin: string) {
  const target = new URL(next, origin);
  const base = new URL(origin);
  if (isLoopbackHost(target.hostname) && !isLoopbackHost(base.hostname)) {
    target.protocol = base.protocol;
    target.host = base.host;
  }
  return target.toString();
}

async function fetchMedia(url: string, headers: Headers, method: "GET" | "HEAD") {
  let current = url;
  for (let hop = 0; hop < 4; hop += 1) {
    const upstream = await fetch(current, { method, headers, redirect: "manual" });
    if (upstream.status < 300 || upstream.status >= 400) return upstream;
    const location = upstream.headers.get("location");
    await upstream.body?.cancel();
    if (!location) return upstream;
    const next = rewriteLoopback(location, current);
    if (new URL(next).origin !== new URL(url).origin) {
      throw new Error("Cross-origin media redirects are not allowed.");
    }
    current = next;
  }
  throw new Error("Media server redirected too many times.");
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
        const seg = requestUrl.searchParams.get("seg");
        if (seg !== null && /^\d+$/.test(seg)) {
          try {
            const target = convertSegmentUrl(ticket.url, seg);
            const upstreamUrl = requestUrl.searchParams.get("whole") === "1" ? `${target}${target.includes("?") ? "&" : "?"}whole=1` : target;
            const upstream = await fetchMedia(upstreamUrl, upstreamHeaders(ticket.headers, ""), "GET");
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
          upstream = await fetchMedia(ticket.url, upstreamHeaders(ticket.headers, range), "GET");
          const type = upstream.headers.get("content-type") || "";
          if (range && !isVideoResponse(upstream.status, type)) {
            await upstream.body?.cancel();
            upstream = await fetchMedia(ticket.url, upstreamHeaders(ticket.headers, ""), "GET");
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
        const range = isLiveTranscode(ticket.url) ? "" : request.headers.get("range") || "";
        try {
          let upstream = await fetchMedia(ticket.url, upstreamHeaders(ticket.headers, range), "HEAD");
          if ((upstream.status === 405 || upstream.status === 501) && !isLiveTranscode(ticket.url)) {
            upstream = await fetchMedia(ticket.url, upstreamHeaders(ticket.headers, range || "bytes=0-1"), "GET");
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
