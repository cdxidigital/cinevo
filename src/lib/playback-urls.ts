export function isLoopbackUrl(url?: string) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local");
  } catch {
    return /localhost|127\.0\.0\.1/.test(url);
  }
}

/** Reject schemes and cloud-metadata hosts. Private LAN addresses stay allowed. */
export function serverAddressError(uri: string) {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return "That server address is not allowed.";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "That server address is not allowed.";
  const host = url.hostname.toLowerCase();
  if (host === "169.254.169.254" || host === "metadata.google.internal") return "That server address is not allowed.";
  return null;
}

export type PlaybackFit = "original" | "compatible";

function plexLocation(uri: string) {
  try {
    const host = new URL(uri).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      host === "localhost" ||
      host.endsWith(".local") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.startsWith("127.")
    ) {
      return "lan";
    }
  } catch {
    /* public */
  }
  return "wan";
}

const PLEX_HLS_PROFILE =
  "add-transcode-target(type=videoProfile&context=streaming&protocol=hls&container=mpegts&videoCodec=h264&audioCodec=aac&subtitleCodec=)";

/** One id per play. Plex keys its transcode session on it, and `plexStopUrl` ends it. */
export function plexSessionId(ratingKey: string) {
  const key = ratingKey.replace(/^plex-/, "").replace(/[^a-z0-9]/gi, "");
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `cinevo${key}${rand}`.slice(0, 40);
}

/**
 * Plex HLS transcode (`start.m3u8`, protocol=hls). Plex's own web player and the
 * common client libraries use this path. Every response is a short playlist or
 * segment, so it plays straight from Plex in the browser and also fits through
 * the CINEVO proxy without one long-lived function response.
 *
 * The token is only put in the URL when `token` is passed. Native HLS (iOS Safari)
 * cannot send headers, so it needs it; hls.js sends it as a header instead.
 */
export function plexHlsUrl(
  uri: string,
  ratingKey: string,
  clientId: string,
  fit: PlaybackFit = "original",
  session = plexSessionId(ratingKey),
  token?: string,
) {
  const key = ratingKey.replace(/^plex-/, "").replace(/^\//, "");
  const client = clientId || "cinevo-web";
  const compatible = fit === "compatible";
  const params = new URLSearchParams({
    hasMDE: "1",
    path: `/library/metadata/${key}`,
    mediaIndex: "0",
    partIndex: "0",
    protocol: "hls",
    fastSeek: "1",
    directPlay: "0",
    directStream: compatible ? "0" : "1",
    directStreamAudio: compatible ? "0" : "1",
    videoQuality: compatible ? "70" : "99",
    maxVideoBitrate: compatible ? "12000" : "200000",
    location: plexLocation(uri),
    mediaBufferSize: "20480",
    audioBoost: "100",
    autoAdjustQuality: "0",
    copyts: "1",
    offset: "0",
    session,
    "X-Plex-Session-Identifier": session,
    "X-Plex-Product": "CINEVO",
    "X-Plex-Client-Identifier": client,
    "X-Plex-Platform": "Chrome",
    "X-Plex-Device": "Web",
    "X-Plex-Device-Name": "CINEVO",
    "X-Plex-Version": "1.0.0",
    "X-Plex-Client-Profile-Name": "CINEVO",
    "X-Plex-Client-Profile-Extra": PLEX_HLS_PROFILE,
  });
  if (compatible) {
    params.set("videoCodec", "h264");
    params.set("audioCodec", "aac");
  }
  if (token) params.set("X-Plex-Token", token);
  return `${uri.replace(/\/$/, "")}/video/:/transcode/universal/start.m3u8?${params.toString()}`;
}

export function plexStopUrl(uri: string, session: string) {
  return `${uri.replace(/\/$/, "")}/video/:/transcode/universal/stop?${new URLSearchParams({ session }).toString()}`;
}

/** Server-side (proxy) Plex target. The token rides on the header only, never in the stored URL. */
export function plexStreamTarget(
  uri: string,
  ratingKey: string,
  token: string,
  clientId: string,
  fit: PlaybackFit = "original",
) {
  const client = clientId || "cinevo-web";
  const headers: Record<string, string> = {
    "X-Plex-Token": token,
    "X-Plex-Product": "CINEVO",
    "X-Plex-Client-Identifier": client,
    "X-Plex-Platform": "Chrome",
    "X-Plex-Device": "Web",
    "X-Plex-Device-Name": "CINEVO",
    "X-Plex-Client-Profile-Name": "CINEVO",
    "X-Plex-Client-Profile-Extra": PLEX_HLS_PROFILE,
    Accept: "*/*",
  };
  return {
    url: plexHlsUrl(uri, ratingKey, client, fit),
    headers,
  };
}

export function jellyfinStreamTarget(
  base: string,
  itemId: string,
  token: string,
  clientId: string,
  fit: PlaybackFit = "original",
) {
  const id = itemId.replace(/^jellyfin-/, "").replace(/^jf-/, "");
  const client = clientId || "cinevo-web";
  const compatible = fit === "compatible";
  const session = `c${Date.now().toString(36)}`.replace(/[^a-z0-9]/gi, "").slice(0, 24);
  const params = new URLSearchParams({
    static: compatible ? "false" : "true",
    mediaSourceId: id,
    MaxStreamingBitrate: compatible ? "12000000" : "200000000",
    api_key: token,
    PlaySessionId: session,
  });
  if (compatible) {
    params.set("VideoCodec", "h264");
    params.set("AudioCodec", "aac");
    params.set("Container", "mp4");
    params.set("TranscodingContainer", "mp4");
    params.set("TranscodingProtocol", "http");
    params.set("SegmentContainer", "mp4");
    params.set("AllowVideoStreamCopy", "false");
    params.set("AllowAudioStreamCopy", "false");
    params.set("MaxAudioChannels", "2");
    params.set("CopyTimestamps", "false");
  }
  return {
    url: `${base.replace(/\/$/, "")}/Videos/${encodeURIComponent(id)}/stream.mp4?${params.toString()}`,
    headers: {
      "X-Emby-Token": token,
      Authorization: `MediaBrowser Client="CINEVO", Device="Web", DeviceId="${client}", Version="1.0.0", Token="${token}"`,
      Accept: "*/*",
    },
  };
}

/** Token stays on the Authorization header so it is not written into the stream URL. */
export function nodeStreamTarget(base: string, token: string, filePath: string, id?: string, fit: PlaybackFit = "original") {
  const params = new URLSearchParams({ path: filePath });
  if (id) params.set("id", id);
  if (fit === "compatible") params.set("fit", "compatible");
  return {
    url: `${base.replace(/\/$/, "")}/v1/play?${params.toString()}`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "*/*",
    },
  };
}
