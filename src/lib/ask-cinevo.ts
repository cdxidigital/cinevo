import { createServerFn } from "@tanstack/react-start";
import { runAttendant } from "@/lib/attendant";
import type { PremiereTitle } from "@/lib/premiere";

export const askCinevo = createServerFn({ method: "POST" })
  .validator((input: { question: string; titles?: PremiereTitle[] }) => input)
  .handler(async ({ data }) => {
    const question = data.question.trim().slice(0, 400);
    if (!question) return { ok: false as const, error: "Ask something first." };

    const titles = (data.titles ?? []).slice(0, 80).map((title) => ({
      ...title,
      title: String(title.title || "").slice(0, 140),
      synopsis: String(title.synopsis || "").slice(0, 180),
    }));
    const planned = runAttendant(question, titles);
    if (!titles.length || !planned) {
      return { ok: true as const, text: "Your library is empty. Add a folder or sign in with Plex, then ask again.", plan: null };
    }

    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: true as const, text: planned.line, plan: planned };

    const catalog = titles
      .map((title) => `${title.title} | ${title.year} | ${title.kind} | ${title.genre} | rating ${title.rating}${title.favorite ? " | saved" : ""}${title.progress ? ` | seen ${Math.round((title.progress > 1 ? title.progress : title.progress * 100))}%` : ""}`)
      .join("\n");
    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
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
