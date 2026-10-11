const NATIVE = new Set(["mp4", "m4v", "webm", "mov"]);

/** Containers a browser can usually play without a conversion. */
export function needsBrowserCopy(filePath: string) {
  const base = filePath.split(/[/\\]/).pop() || filePath;
  const ext = base.includes(".") ? base.split(".").pop()?.toLowerCase() || "" : "";
  return !NATIVE.has(ext);
}

/** Point each HLS segment at this house, keeping the ticket's server credentials. */
export function rewriteConvertPlaylist(body: string, ticketId: string) {
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return line;
      const index = /(?:^|[?&])i=(\d+)/.exec(trimmed)?.[1] ?? "0";
      const whole = /(?:^|[?&])whole=1/.test(trimmed) ? "&whole=1" : "";
      return `/api/stream/${ticketId}?seg=${index}${whole}`;
    })
    .join("\n");
}

export function convertSegmentUrl(playUrl: string, index: string) {
  const url = new URL(playUrl);
  url.pathname = url.pathname.replace(/\/v1\/play$/, "/v1/convert");
  url.searchParams.delete("fit");
  url.searchParams.set("i", index);
  if (url.searchParams.get("whole") === "1") url.searchParams.set("whole", "1");
  return url.toString();
}
