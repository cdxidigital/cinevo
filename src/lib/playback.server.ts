import { getSql } from "@/lib/db";
import { jellyfinStreamTarget, nodeStreamTarget, plexStreamTarget, serverAddressError, type PlaybackFit } from "@/lib/playback-urls";

function ticketId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function createTicket(input: {
  userId: string;
  provider: "plex" | "jellyfin" | "node";
  uri: string;
  key: string;
  token: string;
  clientId?: string;
  fit?: PlaybackFit;
}) {
  const uri = input.uri.trim();
  const key = input.key.trim();
  const token = input.token.trim();
  if (!uri || !key || !token) return { ok: false as const, error: "Missing playback details." };
  const blocked = serverAddressError(uri);
  if (blocked) return { ok: false as const, error: blocked };
  const clientId = input.clientId || "cinevo-web";
  const fit = input.fit === "compatible" ? "compatible" : "original";
  const target =
    input.provider === "plex"
      ? plexStreamTarget(uri, key, token, clientId, fit)
      : input.provider === "jellyfin"
        ? jellyfinStreamTarget(uri, key, token, clientId, fit)
        : nodeStreamTarget(uri, token, key, clientId, fit);
  const id = ticketId();
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const sql = await getSql();
  await sql`delete from cinevo_play_tickets where expires_at < now()`;
  await sql`
    insert into cinevo_play_tickets (id, user_id, provider, url, headers, expires_at)
    values (${id}, ${input.userId}, ${input.provider}, ${target.url}, ${JSON.stringify(target.headers)}, ${expires}::timestamptz)
  `;
  return { ok: true as const, src: `/api/stream/${id}` };
}

export async function loadTicket(id: string) {
  const sql = await getSql();
  const rows = await sql<{
    url: string;
    headers: string | Record<string, string>;
    expires_at: string;
  }>`
    select url, headers, expires_at::text from cinevo_play_tickets
    where id = ${id} and expires_at > now()
  `;
  const row = rows[0];
  if (!row) return null;
  let headers: Record<string, string> = {};
  try {
    headers = (typeof row.headers === "string" ? JSON.parse(row.headers) : row.headers) as Record<string, string>;
  } catch {
    headers = {};
  }
  return { url: row.url, headers };
}
