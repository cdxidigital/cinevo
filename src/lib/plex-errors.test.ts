import assert from "node:assert/strict";
import test from "node:test";
import { plexStatusMessage, upstreamStatus } from "./plex-errors.ts";

test("Plex statuses become plain messages, not codec errors", () => {
  assert.match(plexStatusMessage(401), /Reconnect Plex/);
  assert.match(plexStatusMessage(403), /Remote Watch Pass/);
  assert.match(plexStatusMessage(400), /\(400\)/);
  assert.match(plexStatusMessage(0, "direct"), /This browser could not reach/);
  assert.match(plexStatusMessage(0, "proxy"), /Remote Access/);
  assert.match(plexStatusMessage(503), /\(503\)/);
  for (const s of [0, 400, 401, 403, 404, 410, 429, 500]) {
    assert.equal(/codec|browser-friendly copy/i.test(plexStatusMessage(s)), false);
  }
});

test("reads the upstream status the proxy reports, from XHR or fetch", () => {
  const xhr = { getResponseHeader: (n: string) => (n === "x-cinevo-upstream-status" ? "403" : null) };
  assert.equal(upstreamStatus(xhr), 403);
  assert.equal(upstreamStatus(new Response("", { headers: { "X-Cinevo-Upstream-Status": "401" } })), 401);
  assert.equal(upstreamStatus(new Response("")), null);
  assert.equal(upstreamStatus({ getResponseHeader: () => "nope" }), null);
  assert.equal(upstreamStatus(null), null);
});
