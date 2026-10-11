import { getSql } from "@/lib/db";
import { factsFromJellyfin, factsFromPlex, type MediaFacts } from "@/lib/artwork-model";
import { parsePlexMetadata } from "@/lib/plex";
import { serverAddressError } from "@/lib/playback-urls";
import { mediaEgressError } from "@/lib/media-egress.server";

function ticketId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function plexHeaders(clientId: string, token: string) {
  return {
    Accept: "application/json",
    "X-Plex-Token": token,
    "X-Plex-Product": "CINEVO",
    "X-Plex-Client-Identifier": clientId || "cinevo-web",
    "X-Plex-Platform": "Chrome",
    "X-Plex-Version": "1.0.0",
  };
}

function jellyfinHeader(clientId: string, token: string) {
  return {
    Accept: "application/json",
    "X-Emby-Token": token,
    "X-Emby-Authorization": `MediaBrowser Client="CINEVO", Device="Web", DeviceId="${clientId || "cinevo-web"}", Version="1.0.0", Token="${token}"`,
  };
}

export async function createArtTicket(input: { userId: string; provider: "plex" | "jellyfin"; uri: string; token: string; clientId?: string }) {
  const uri = input.uri.trim().replace(/\/$/, "");
  const blocked = serverAddressError(uri) || (await mediaEgressError(uri));
  if (blocked) return { ok: false as const, error: blocked };
  if (!input.token.trim()) return { ok: false as const, error: "Missing library token." };
  const headers = input.provider === "plex" ? plexHeaders(input.clientId || "", input.token.trim()) : jellyfinHeader(input.clientId || "", input.token.trim());
  const id = ticketId();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const sql = await getSql();
  await sql`
    insert into cinevo_play_tickets (id, user_id, provider, url, headers, expires_at)
    values (${id}, ${input.userId}, ${`art-${input.provider}`}, ${uri}, ${JSON.stringify(headers)}, ${expires}::timestamptz)
  `;
  return { ok: true as const, ticket: id };
}

export type ArtItem = MediaFacts & { id: string };

async function plexItems(uri: string, token: string, clientId: string, keys: string[]): Promise<ArtItem[]> {
  const items: ArtItem[] = [];
  const headers = plexHeaders(clientId, token);
  for (let i = 0; i < keys.length; i += 20) {
    const chunk = keys.slice(i, i + 20).map((key) => key.replace(/^plex-/, "")).filter(Boolean);
    if (!chunk.length) continue;
    try {
      const res = await fetch(`${uri}/library/metadata/${chunk.join(",")}`, { headers, redirect: "error", signal: AbortSignal.timeout(12000) });
      if (!res.ok) continue;
      const body = (await res.json()) as unknown;
      for (const row of parsePlexMetadata(body, "")) {
        const facts = factsFromPlex(
          {
            summary: row.synopsis,
            year: row.year,
            rating: row.rating,
            Genre: row.genres.map((tag) => ({ tag })),
            Role: row.cast.map((tag) => ({ tag })),
            Director: row.director ? [{ tag: row.director }] : [],
            thumb: row.posterPath,
            art: row.stillPath,
            grandparentThumb: row.showPosterPath,
          },
          row.ratingKey,
        );
        items.push({ id: row.id, ...facts, runtime: row.runtime || facts.runtime, showPosterPath: row.showPosterPath || facts.showPosterPath });
      }
    } catch {
      /* this server may be offline */
    }
  }
  return items;
}

async function jellyfinItems(uri: string, token: string, clientId: string, userId: string, keys: string[]): Promise<ArtItem[]> {
  const ids = keys.map((key) => key.replace(/^jellyfin-/, "").replace(/^jf-/, "")).filter(Boolean);
  if (!ids.length) return [];
  const headers = jellyfinHeader(clientId, token);
  const params = new URLSearchParams({
    Ids: ids.slice(0, 80).join(","),
    Fields: "Overview,Genres,People,ProductionYear,PremiereDate,RunTimeTicks,CommunityRating,ImageTags,BackdropImageTags,Studios,OfficialRating,SeriesId,SeriesPrimaryImageTag",
  });
  const path = userId ? `/Users/${encodeURIComponent(userId)}/Items?${params}` : `/Items?${params}`;
  try {
    const res = await fetch(`${uri}${path}`, { headers, redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!res.ok) return [];
    const body = (await res.json()) as { Items?: unknown[] };
    return (body.Items || []).slice(0, 80).map((item) => {
      const row = item as { Id?: string };
      const facts = factsFromJellyfin(row as Parameters<typeof factsFromJellyfin>[0]);
      return { id: `jellyfin-${row.Id || ""}`, ...facts };
    });
  } catch {
    return [];
  }
}

export async function refreshArtwork(input: {
  userId: string;
  provider: "plex" | "jellyfin";
  uri: string;
  token: string;
  clientId?: string;
  userServerId?: string;
  keys: string[];
  ticket?: string;
}) {
  const uri = input.uri.trim().replace(/\/$/, "");
  const blocked = serverAddressError(uri) || (await mediaEgressError(uri));
  if (blocked) return { ok: false as const, error: blocked };
  let ticketId = input.ticket?.trim() || "";
  if (ticketId) {
    const sql = await getSql();
    const rows = await sql`
      select id from cinevo_play_tickets
      where id = ${ticketId} and user_id = ${input.userId} and expires_at > now()
    `;
    if (!rows.length) ticketId = "";
  }
  if (!ticketId) {
    const created = await createArtTicket(input);
    if (!created.ok) return created;
    ticketId = created.ticket;
  }
  const keys = input.keys.map((key) => key.trim()).filter(Boolean).slice(0, 80);
  const items =
    input.provider === "plex"
      ? await plexItems(uri, input.token.trim(), input.clientId || "", keys)
      : await jellyfinItems(uri, input.token.trim(), input.clientId || "", input.userServerId || "", keys);
  return { ok: true as const, ticket: ticketId, items };
}
