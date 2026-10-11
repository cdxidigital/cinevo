import { createFileRoute } from "@tanstack/react-router";
import { approveDesk, loginPasskey, newChallenge, openDesk, readDesk, registerPasskey } from "@/lib/passkey.server";
import { pageOrigin } from "@/lib/passkey-crypto";

function json(body: unknown, status = 200, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  if (cookie) headers.set("set-cookie", cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export const Route = createFileRoute("/api/passkey")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const secret = new URL(request.url).searchParams.get("desk") || "";
        if (!secret) return json({ error: "Missing code." }, 400);
        return json(await readDesk(secret));
      },
      POST: async ({ request }) => {
        const where = pageOrigin(request);
        if (!where) return json({ error: "This page could not confirm its address. Reload and try again." }, 400);
        let body: Record<string, string> = {};
        try {
          body = (await request.json()) as Record<string, string>;
        } catch {
          return json({ error: "Missing request." }, 400);
        }
        try {
          if (body.action === "challenge") {
            const challenge = await newChallenge();
            return json({ ...challenge, rpId: where.rpId });
          }
          if (body.action === "register") {
            const session = await registerPasskey(request, body);
            return json({ token: session.token }, 200, session.cookie);
          }
          if (body.action === "login") {
            const session = await loginPasskey(request, body);
            return json({ token: session.token }, 200, session.cookie);
          }
          if (body.action === "desk") {
            return json(await openDesk());
          }
          if (body.action === "approve") {
            await approveDesk(request, body.secret || "");
            return json({ ok: true });
          }
          return json({ error: "Unknown request." }, 400);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Passkey failed.";
          return json({ error: message }, 400);
        }
      },
    },
  },
});

