"use strict";

/** RFC 7233 single byte-range parser for a file of `size` bytes. */
function parseByteRange(header, size) {
  if (header === undefined || header === null || header === "") return null;
  const value = String(header).trim();
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  const invalid = { unsatisfiable: true };
  if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(size) || size <= 0) return invalid;
  const first = match[1];
  const last = match[2];
  let start;
  let end;
  if (first === "") {
    const count = Number(last);
    if (!Number.isSafeInteger(count) || count <= 0) return invalid;
    start = Math.max(0, size - count);
    end = size - 1;
  } else {
    start = Number(first);
    end = last ? Number(last) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return invalid;
    end = Math.min(end, size - 1);
  }
  return { start, end };
}

module.exports = { parseByteRange };
