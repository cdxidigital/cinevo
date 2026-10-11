import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { serverAddressError } from "@/lib/playback-urls";
import {
  parsePlexFolderPage,
  parsePlexMetadata,
  parsePlexResources,
  parsePlexSections,
  rankConnections,
  type PlexServer,
} from "./plex";

function plexHeaders(clientId: string, token?: string) {
  return {
    Accept: "application/json",
    "X-Plex-Product": "CINEVO",
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Version": "1.0.0",
    "X-Plex-Platform": "Web",
    "X-Plex-Device": "Web",
    "X-Plex-Device-Name": "CINEVO",
    ...(token ? { "X-Plex-Token": token } : {}),
  };
}

async function plexJson(url: string, headers: Record<string, string>, ms = 8000, init: RequestInit = {}): Promise<unknown> {
  if (serverAddressError(url)) throw new Error("That Plex server address is not allowed.");
  const { assertSafeMediaEgress } = await import("./media-egress.server");
  await assertSafeMediaEgress(url);
  const res = await fetch(url, {
    redirect: "error",
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    signal: AbortSignal.timeout(ms),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> | unknown[];
  if (!res.ok) {
    const row = Array.isArray(data) ? {} : data;
    throw new Error(String(row.error || row.message || `Plex returned ${res.status}`));
  }
  return data;
}

export const plexStartPin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clientId: string }) => input)
  .handler(async ({ data }) => {
    const clientId = data.clientId.trim();
    if (!clientId) return { ok: false as const, error: "Missing Plex client id." };
    try {
      const body = (await plexJson(
        "https://plex.tv/api/v2/pins?strong=true",
        plexHeaders(clientId),
        8000,
        { method: "POST" },
      )) as Record<string, unknown>;
      const id = Number(body.id);
      const code = String(body.code || "");
      if (!id || !code) return { ok: false as const, error: "Plex did not issue a sign-in pin." };
      return { ok: true as const, id, code };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Could not start Plex sign-in." };
    }
  });

export const plexPollPin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clientId: string; pinId: number }) => input)
  .handler(async ({ data }) => {
    try {
      const body = (await plexJson(
        `https://plex.tv/api/v2/pins/${data.pinId}`,
        plexHeaders(data.clientId),
        6000,
      )) as Record<string, unknown>;
      const token = typeof body.authToken === "string" ? body.authToken : "";
      return { ok: true as const, token: token || null };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Plex sign-in timed out." };
    }
  });

export const plexListServers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clientId: string; token: string }) => input)
  .handler(async ({ data }) => {
    const headers = plexHeaders(data.clientId, data.token);
    try {
      const [userRaw, resources] = await Promise.all([
        plexJson("https://plex.tv/api/v2/user", headers),
        plexJson("https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1", headers),
      ]);
      const user = userRaw as Record<string, unknown>;
      const servers = parsePlexResources(resources);
      return {
        ok: true as const,
        username: String(user.username || user.title || user.email || "Plex"),
        servers,
      };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Could not list Plex servers." };
    }
  });

export const plexOpenServer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clientId: string; token: string; server: PlexServer }) => input)
  .handler(async ({ data }) => {
    const token = data.server.accessToken || data.token;
    const ranked = rankConnections(data.server.connections);
    if (!ranked.length) return { ok: false as const, error: "That server has no reachable connections." };
    let last = "Could not reach that Plex server from here.";
    for (const conn of ranked) {
      try {
        const body = await plexJson(
          `${conn.uri}/library/sections`,
          { ...plexHeaders(data.clientId, token), "X-Plex-Token": token },
          conn.local ? 2500 : 6000,
        );
        const sections = parsePlexSections(body);
        return {
          ok: true as const,
          uri: conn.uri,
          kind: conn.relay ? "relay" : conn.local ? "local" : "remote",
          sections,
        };
      } catch (err) {
        last = err instanceof Error ? err.message : last;
      }
    }
    return { ok: false as const, error: last };
  });

export const plexImportSections = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clientId: string; token: string; uri: string; sourceLabel: string; sectionKeys: string[] }) => input)
  .handler(async ({ data }) => {
    const headers = { ...plexHeaders(data.clientId, data.token), "X-Plex-Token": data.token };
    const titles: ReturnType<typeof parsePlexMetadata> = [];
    const folders = new Set<string>();
    try {
      for (const key of data.sectionKeys.slice(0, 12)) {
        const before = folders.size;
        for (let start = 0; start < 1600 && titles.length < 1600; start += 200) {
          let body: unknown;
          try {
            body = await plexJson(
              `${data.uri}/library/sections/${encodeURIComponent(key)}/allLeaves?X-Plex-Container-Start=${start}&X-Plex-Container-Size=200`,
              headers,
              12000,
            );
          } catch (err) {
            if (start > 0) break;
            body = await plexJson(
              `${data.uri}/library/sections/${encodeURIComponent(key)}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=200`,
              headers,
              12000,
            ).catch(() => {
              throw err;
            });
          }
          const page = parsePlexMetadata(body, data.sourceLabel);
          if (!page.length) break;
          titles.push(...page);
          for (const title of page) if (title.folder) folders.add(title.folder);
          const total = Number((body as { MediaContainer?: { totalSize?: number } }).MediaContainer?.totalSize || 0);
          if (page.length < 200 || (total > 0 && start + page.length >= total)) break;
        }
        if (folders.size === before) await walkPlexFolders(data.uri, key, headers, folders);
      }
      const seen = new Set<string>();
      const unique = titles.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
      return { ok: true as const, titles: unique.slice(0, 1600), folders: [...folders].slice(0, 400) };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : "Could not import that Plex library." };
    }
  });

async function walkPlexFolders(uri: string, sectionKey: string, headers: Record<string, string>, found: Set<string>) {
  const seen = new Set<string>();
  const walk = async (query: string, prefix: string, depth: number) => {
    if (depth > 5 || found.size >= 400 || seen.has(query)) return;
    seen.add(query);
    let body: unknown;
    try {
      body = await plexJson(`${uri}/library/sections/${encodeURIComponent(sectionKey)}/folder${query}`, headers, 8000);
    } catch {
      return;
    }
    for (const row of parsePlexFolderPage(body)) {
      const name = row.name || row.file.split(/[/\\]/).pop() || "";
      const next = row.file
        ? row.file.replace(/\\/g, "/").split("/").slice(0, -1).filter(Boolean).join("/")
        : prefix && name
          ? `${prefix}/${name}`
          : name;
      if (next) found.add(next);
      if (!row.directory && row.file) continue;
      const parent = row.key.includes("?") ? row.key.slice(row.key.indexOf("?")) : "";
      if (parent) await walk(parent, next, depth + 1);
    }
  };
  await walk("", "", 0);
}
