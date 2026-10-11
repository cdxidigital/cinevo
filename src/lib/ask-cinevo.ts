import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { runAttendant } from "@/lib/attendant";
import type { PremiereTitle } from "@/lib/premiere";

export const getAiConsent = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ enabled: boolean }>`
      select enabled from cinevo_ai_consents where user_id = ${context.userId}
    `;
    return { ok: true as const, enabled: rows[0]?.enabled === true };
  });

export const setAiConsentServer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { enabled: boolean }) => input)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const enabled = data.enabled === true;
    await sql`
      insert into cinevo_ai_consents (user_id, enabled, updated_at)
      values (${context.userId}, ${enabled}, now())
      on conflict (user_id) do update set enabled = excluded.enabled, updated_at = now()
    `;
    return { ok: true as const, enabled };
  });

export const askCinevo = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { question: string; titles?: PremiereTitle[] }) => input)
  .handler(async ({ data, context }) => {
    if (!data || typeof data.question !== "string" || data.question.length > 400 ||
        (data.titles !== undefined && !Array.isArray(data.titles))) {
      return { ok: false as const, error: "That request was too large or invalid." };
    }
    const question = data.question.trim();
    if (!question) return { ok: false as const, error: "Ask something first." };

    const titles = (data.titles ?? []).slice(0, 80).map((title) => ({
      ...title,
      id: String(title.id || "").slice(0, 160),
      title: String(title.title || "").slice(0, 140),
      year: String(title.year || "").slice(0, 10),
      genre: String(title.genre || "").slice(0, 80),
      runtime: String(title.runtime || "").slice(0, 40),
      synopsis: String(title.synopsis || "").slice(0, 180),
    }));
    const planned = runAttendant(question, titles);
    if (!titles.length || !planned) {
      return { ok: true as const, text: "Your library is empty. Add a folder or sign in with Plex, then ask again.", plan: null };
    }

    const apiKey = process.env.XAI_API_KEY;
    // Paid requests are OFF unless explicitly enabled by the operator.
    // Consent and quota are verified server-side; client booleans are untrusted.
    if (!apiKey || process.env.CINEVO_PAID_AI_ENABLED !== "true") {
      return { ok: true as const, text: planned.line, plan: planned };
    }
    const sql = await getSql();
    const consent = await sql<{ enabled: boolean }>`
      select enabled from cinevo_ai_consents where user_id = ${context.userId}
    `;
    if (consent[0]?.enabled !== true) return { ok: true as const, text: planned.line, plan: planned };
    const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000).toISOString();
    // Durable cross-instance quota, 12 paid requests per user per hour.
    const available = await sql<{ used: number }>`
      insert into cinevo_ai_usage (user_id, window_start, used)
      values (${context.userId}, ${windowStart}::timestamptz, 1)
      on conflict (user_id, window_start)
      do update set used = cinevo_ai_usage.used + 1
      where cinevo_ai_usage.used < 12
      returning used
    `;
    if (!available.length) return { ok: true as const, text: planned.line, plan: planned };

    const catalog = titles
      .map((title) => `${title.title} | ${title.year} | ${title.kind} | ${title.genre} | rating ${title.rating}${title.favorite ? " | saved" : ""}${title.progress ? ` | seen ${Math.round((title.progress > 1 ? title.progress : title.progress * 100))}%` : ""}`)
      .join("\n");
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          max_tokens: 120,
          messages: [
            {
              role: "system",
              content:
                "You are the CINEVO attendant. The house has already chosen the title. Reply with one calm sentence a projectionist would say. Do not invent a title. Do not add a list.",
            },
            { role: "user", content: `Catalog:\n${catalog}\n\nThe house will play: ${planned.line}\n\nGuest: ${question}` },
          ],
        }),
      });
      if (!res.ok) return { ok: true as const, text: planned.line, plan: planned };
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const line = body.choices?.[0]?.message?.content?.replace(/\s+/g, " ").trim().slice(0, 280);
      return { ok: true as const, text: line || planned.line, plan: { ...planned, line: line || planned.line } };
    } catch {
      return { ok: true as const, text: planned.line, plan: planned };
    }
  });
