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

export function plexStreamTarget(
  uri: string,
  ratingKey: string,
  token: string,
  clientId: string,
  fit: PlaybackFit = "original",
) {
  const key = ratingKey.replace(/^plex-/, "").replace(/^\//, "");
  const client = clientId || "cinevo-web";
  const compatible = fit === "compatible";
  const base = uri.replace(/\/$/, "");
  const session = `c${Date.now().toString(36)}${key}`.replace(/[^a-z0-9]/gi, "").slice(0, 40);
  const profile =
    "add-transcode-target(type=videoProfile&context=streaming&protocol=http&container=mp4&videoCodec=h264&audioCodec=aac&subtitleCodec=)";
  const params = new URLSearchParams({
    hasMDE: "1",
    path: `/library/metadata/${key}`,
    mediaIndex: "0",
    partIndex: "0",
    protocol: "http",
    fastSeek: "1",
    directPlay: "0",
    directStream: compatible ? "0" : "1",
    directStreamAudio: compatible ? "0" : "1",
    videoQuality: compatible ? "70" : "99",
    maxVideoBitrate: compatible ? "12000" : "200000",
    location: plexLocation(uri),
    mediaBufferSize: compatible ? "20480" : "20480",
    audioBoost: "100",
    autoAdjustQuality: "0",
    copyts: compatible ? "0" : "1",
    offset: "0",
    subtitles: "none",
    session,
    "X-Plex-Product": "CINEVO",
    "X-Plex-Client-Identifier": client,
    "X-Plex-Platform": "Chrome",
    "X-Plex-Device": "Web",
    "X-Plex-Device-Name": "CINEVO",
    "X-Plex-Version": "1.0.0",
    "X-Plex-Client-Profile-Name": "CINEVO",
    "X-Plex-Client-Profile-Extra": profile,
    "X-Plex-Token": token,
  });
  if (compatible) {
    params.set("videoCodec", "h264");
    params.set("audioCodec", "aac");
    params.set("container", "mp4");
  }
  const headers: Record<string, string> = {
    "X-Plex-Token": token,
    "X-Plex-Product": "CINEVO",
    "X-Plex-Client-Identifier": client,
    "X-Plex-Platform": "Chrome",
    "X-Plex-Device": "Web",
    "X-Plex-Device-Name": "CINEVO",
    "X-Plex-Client-Profile-Name": "CINEVO",
    "X-Plex-Client-Profile-Extra": profile,
    Accept: "*/*",
  };
  return {
    url: `${base}/video/:/transcode/universal/start.mp4?${params.toString()}`,
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
