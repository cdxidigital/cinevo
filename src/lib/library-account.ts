import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { LibSource, LibraryTitle } from "@/lib/library";
import type { PlexServer } from "@/lib/plex";

export type SavedLibrary = {
  plexToken: string;
  plexUser: string;
  plexClientId: string;
  plexServers: PlexServer[];
  nodeUrl: string;
  nodeToken: string;
  nodeDevice: string;
  sources: LibSource[];
  remoteTitles: LibraryTitle[];
  nodeTitles: LibraryTitle[];
};

function asList<T>(value: unknown, max: number): T[] {
  return Array.isArray(value) ? (value.slice(0, max) as T[]) : [];
}

function lightTitles(value: unknown, max: number): LibraryTitle[] {
  return asList<LibraryTitle>(value, max).map((title) => ({
    ...title,
    poster: title.poster?.startsWith("data:") ? "" : title.poster,
    still: title.still?.startsWith("data:") ? "" : title.still,
  }));
}

function clean(input: Partial<SavedLibrary>): SavedLibrary {
  return {
    plexToken: String(input.plexToken || "").slice(0, 400),
    plexUser: String(input.plexUser || "").slice(0, 80),
    plexClientId: String(input.plexClientId || "").slice(0, 80),
    plexServers: asList<PlexServer>(input.plexServers, 12),
    nodeUrl: String(input.nodeUrl || "").slice(0, 200),
    nodeToken: String(input.nodeToken || "").slice(0, 400),
    nodeDevice: String(input.nodeDevice || "").slice(0, 80),
    sources: asList<LibSource>(input.sources, 40),
    remoteTitles: lightTitles(input.remoteTitles, 2000),
    nodeTitles: lightTitles(input.nodeTitles, 2000),
  };
}

export const loadAccountLibrary = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ payload: string }>`select payload from cinevo_libraries where user_id = ${context.userId}`;
    if (!rows[0]) return { ok: true as const, library: null as SavedLibrary | null };
    try {
      return { ok: true as const, library: clean(JSON.parse(rows[0].payload) as SavedLibrary) };
    } catch {
      return { ok: true as const, library: null };
    }
  });

export const saveAccountLibrary = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: SavedLibrary) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    const payload = JSON.stringify(clean(data));
    if (payload.length > 4_000_000) return { ok: false as const, error: "That library is too large to keep on the account." };
    await sql`
      insert into cinevo_libraries (user_id, payload, updated_at)
      values (${context.userId}, ${payload}, now())
      on conflict (user_id) do update set payload = excluded.payload, updated_at = now()
    `;
    return { ok: true as const };
  });
