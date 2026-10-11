"use strict";

const path = require("node:path");

const SEGMENT_SECONDS = 6;
const NATIVE = new Set([".mp4", ".m4v", ".webm", ".mov"]);

function needsBrowserCopy(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  return !NATIVE.has(ext);
}

function segmentCount(durationSec) {
  const duration = Number(durationSec);
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.min(20000, Math.max(1, Math.ceil(duration / SEGMENT_SECONDS)));
}

function playlist({ filePath, id, token, duration }) {
  const count = segmentCount(duration);
  const known = Number(duration) > 0;
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    `#EXT-X-TARGETDURATION:${SEGMENT_SECONDS}`,
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  for (let index = 0; index < count; index += 1) {
    const start = index * SEGMENT_SECONDS;
    const length = !known ? SEGMENT_SECONDS : index === count - 1 ? Math.max(0.5, Number(duration) - start) : SEGMENT_SECONDS;
    const params = new URLSearchParams({ path: filePath, i: String(index) });
    if (id) params.set("id", id);
    if (token) params.set("token", token);
    if (!known) params.set("whole", "1");
    lines.push(`#EXTINF:${length.toFixed(3)},`);
    lines.push(`/v1/convert?${params.toString()}`);
  }
  lines.push("#EXT-X-ENDLIST");
  return `${lines.join("\n")}\n`;
}

function pickEncoder(encoderList) {
  const text = String(encoderList || "");
  for (const name of ["h264_videotoolbox", "h264_nvenc", "h264_qsv", "libx264"]) {
    if (new RegExp(`\\b${name}\\b`).test(text)) return name;
  }
  return "";
}

function ffmpegSegmentArgs(filePath, index, encoder, whole) {
  const start = whole ? [] : ["-ss", String(Math.max(0, index) * SEGMENT_SECONDS)];
  const limit = whole ? [] : ["-t", String(SEGMENT_SECONDS)];
  const video =
    encoder === "libx264"
      ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p"]
      : ["-c:v", encoder, "-b:v", "8000k"];
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    ...start,
    "-i",
    filePath,
    ...limit,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    ...video,
    "-c:a",
    "aac",
    "-ac",
    "2",
    "-b:a",
    "160k",
    "-sn",
    "-f",
    "mpegts",
    "pipe:1",
  ];
}

module.exports = {
  SEGMENT_SECONDS,
  needsBrowserCopy,
  segmentCount,
  playlist,
  pickEncoder,
  ffmpegSegmentArgs,
};
