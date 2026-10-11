import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

export type SharedTitle = {
  id: string;
  title: string;
  year: string;
  kind: string;
  genre: string;
  synopsis: string;
  source: "plex" | "jellyfin" | "folder";
  sourceLabel: string;
};

export type ShareRow = {
  id: string;
  token: string;
  guestName: string;
  libraries: string[];
  titles: SharedTitle[];
  days: number;
  status: string;
  createdAt: string;
  expiresAt: string;
  ownerUsername?: string;
};

function parseTitles(raw: string): SharedTitle[] {
  try {
    const data = JSON.parse(raw) as SharedTitle[];
    return Array.isArray(data) ? data.slice(0, 200) : [];
  } catch {
    return [];
  }
}

function parseList(raw: string): string[] {
  try {
    const data = JSON.parse(raw) as string[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function token() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  }
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function suggestUsername(value: string) {
  const stem = value.split("@")[0].replace(/[^A-Za-z0-9_]/g, "");
  const base = (/^[A-Za-z]/.test(stem) ? stem : `c${stem}`).slice(0, 16);
  return base.length >= 3 ? base : "";
}

export function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "");
}

export const claimUsername = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { username: string; display?: string }) => input)
  .handler(async ({ data, context }) => {
    const username = normalizeUsername(data.username);
    if (!USERNAME_RE.test(username)) {
      return { ok: false as const, error: "Usernames are 3–20 letters, numbers, or underscores, starting with a letter." };
    }
    const sql = await getSql();
    const taken = await sql<{ user_id: string }>`
      select user_id from cinevo_profiles where lower(username) = ${username.toLowerCase()} and user_id <> ${context.userId}
    `;
    if (taken.length) return { ok: false as const, error: "That username is taken." };
    const display = (data.display || username).slice(0, 40);
    try {
      await sql`
        insert into cinevo_profiles (user_id, username, display)
        values (${context.userId}, ${username}, ${display})
        on conflict (user_id) do update set username = excluded.username, display = excluded.display
      `;
    } catch {
      return { ok: false as const, error: "That username is taken." };
    }
    return { ok: true as const, username };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      username: string;
      display: string;
      xp: number;
      streak: number;
    }>`select username, display, xp, streak from cinevo_profiles where user_id = ${context.userId}`;
    if (!rows[0]) return { ok: true as const, profile: null };
    return {
      ok: true as const,
      profile: {
        username: rows[0].username,
        display: rows[0].display,
        xp: Number(rows[0].xp),
        streak: Number(rows[0].streak),
      },
    };
  });

export const bumpWatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ streak: number; last_watch: string | null; xp: number }>`
      select streak, last_watch::text as last_watch, xp from cinevo_profiles where user_id = ${context.userId}
    `;
    if (!rows[0]) return { ok: false as const, error: "Claim a username first." };
    const today = new Date().toISOString().slice(0, 10);
    const last = rows[0].last_watch ? String(rows[0].last_watch).slice(0, 10) : null;
    let streak = Number(rows[0].streak) || 0;
    if (last === today) {
      /* already counted */
    } else if (last) {
      const prev = new Date(`${last}T00:00:00Z`);
      const now = new Date(`${today}T00:00:00Z`);
      const diff = (now.getTime() - prev.getTime()) / 86400000;
      streak = diff === 1 ? streak + 1 : 1;
    } else {
      streak = 1;
    }
    const xp = Number(rows[0].xp) + 12;
    await sql`
      update cinevo_profiles set streak = ${streak}, xp = ${xp}, last_watch = ${today}::date
      where user_id = ${context.userId}
    `;
    return { ok: true as const, streak, xp };
  });

export const lookupUsername = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { username: string }) => input)
  .handler(async ({ data }) => {
    const username = normalizeUsername(data.username);
    const sql = await getSql();
    const rows = await sql<{ username: string; display: string }>`
      select username, display from cinevo_profiles where lower(username) = ${username.toLowerCase()}
    `;
    if (!rows[0]) return { ok: false as const, error: "No CINEVO member with that username." };
    return { ok: true as const, username: rows[0].username, display: rows[0].display };
  });

export const createShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { guestName: string; days: number; libraries: string[]; titles: SharedTitle[] }) => input)
  .handler(async ({ data, context }) => {
    const guest = normalizeUsername(data.guestName);
    if (!USERNAME_RE.test(guest)) {
      return { ok: false as const, error: "Name the friend by their CINEVO username." };
    }
    const days = Math.min(30, Math.max(1, Number(data.days) || 7));
    const libraries = (data.libraries || []).slice(0, 12);
    const titles = (data.titles || []).slice(0, 200).map((t) => ({
      id: String(t.id || "").slice(0, 80),
      title: String(t.title || "Untitled").slice(0, 160),
      year: String(t.year || "").slice(0, 8),
      kind: t.kind === "series" ? "series" : "movie",
      genre: String(t.genre || "").slice(0, 40),
      synopsis: String(t.synopsis || "").slice(0, 400),
      source: t.source === "jellyfin" ? "jellyfin" : t.source === "folder" ? "folder" : "plex",
      sourceLabel: String(t.sourceLabel || t.source).slice(0, 80),
    }));
    const sql = await getSql();
    const guestRow = await sql<{ username: string }>`
      select username from cinevo_profiles where lower(username) = ${guest.toLowerCase()}
    `;
    if (!guestRow[0]) return { ok: false as const, error: "No CINEVO member with that username." };
    const guestName = guestRow[0].username;
    const id = `share-${token()}`;
    const shareToken = token();
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    await sql`
      insert into cinevo_shares (id, owner_id, token, guest_name, libraries, titles, days, status, expires_at)
      values (
        ${id},
        ${context.userId},
        ${shareToken},
        ${guestName},
        ${JSON.stringify(libraries)},
        ${JSON.stringify(titles)},
        ${days},
        ${"active"},
        ${expires}::timestamptz
      )
    `;
    return { ok: true as const, id, token: shareToken, expiresAt: expires };
  });

export const listMyShares = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const outgoing = await sql<{
      id: string;
      token: string;
      guest_name: string;
      libraries: string;
      titles: string;
      days: number;
      status: string;
      created_at: string;
      expires_at: string;
    }>`
      select id, token, guest_name, libraries, titles, days, status, created_at::text, expires_at::text
      from cinevo_shares where owner_id = ${context.userId} order by created_at desc
    `;
    const me = await sql<{ username: string }>`select username from cinevo_profiles where user_id = ${context.userId}`;
    const incoming = me[0]
      ? await sql<{
          id: string;
          token: string;
          guest_name: string;
          libraries: string;
          titles: string;
          days: number;
          status: string;
          created_at: string;
          expires_at: string;
          owner_id: string;
        }>`
          select id, token, guest_name, libraries, titles, days, status, created_at::text, expires_at::text, owner_id
          from cinevo_shares
          where lower(guest_name) = ${me[0].username.toLowerCase()} and status = ${"active"}
            and expires_at > now()
          order by created_at desc
        `
      : [];
    const ownerIds = [...new Set(incoming.map((r) => r.owner_id))];
    const owners =
      ownerIds.length === 0
        ? []
        : await Promise.all(
            ownerIds.map(async (id) => {
              const rows = await sql<{ user_id: string; username: string }>`
                select user_id, username from cinevo_profiles where user_id = ${id}
              `;
              return rows[0];
            }),
          );
    const ownerMap = new Map(
      owners.flatMap((o) => (o ? ([[o.user_id, o.username]] as const) : [])),
    );
    const map = (row: (typeof outgoing)[number], ownerUsername?: string): ShareRow => ({
      id: row.id,
      token: row.token,
      guestName: row.guest_name,
      libraries: parseList(row.libraries),
      titles: parseTitles(row.titles),
      days: Number(row.days),
      status: row.status,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      ownerUsername,
    });
    return {
      ok: true as const,
      outgoing: outgoing.map((r) => map(r)),
      incoming: incoming.map((r) => map(r, ownerMap.get(r.owner_id))),
    };
  });

export const setShareStatus = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: "active" | "paused" | "revoked" }) => input)
  .handler(async ({ data, context }) => {
    const sql = await getSql();
    await sql`
      update cinevo_shares set status = ${data.status}
      where id = ${data.id} and owner_id = ${context.userId}
    `;
    return { ok: true as const };
  });

export const openShare = createServerFn({ method: "POST" })
  .validator((input: { token: string }) => input)
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{
      token: string;
      guest_name: string;
      libraries: string;
      titles: string;
      days: number;
      status: string;
      expires_at: string;
      owner_id: string;
    }>`
      select token, guest_name, libraries, titles, days, status, expires_at::text, owner_id
      from cinevo_shares where token = ${data.token.trim()}
    `;
    const row = rows[0];
    if (!row) return { ok: false as const, error: "That invite is not valid." };
    if (row.status !== "active") return { ok: false as const, error: "That invite was paused or revoked." };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const, error: "That invite has expired." };
    const owner = await sql<{ username: string; display: string }>`
      select username, display from cinevo_profiles where user_id = ${row.owner_id}
    `;
    return {
      ok: true as const,
      guestName: row.guest_name,
      libraries: parseList(row.libraries),
      titles: parseTitles(row.titles),
      days: Number(row.days),
      expiresAt: row.expires_at,
      ownerUsername: owner[0]?.username || "CINEVO member",
      ownerDisplay: owner[0]?.display || "CINEVO member",
    };
  });
