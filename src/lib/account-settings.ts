import { createServerFn } from "@tanstack/react-start";
import { auth } from "@/lib/auth/server";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { normalizeUsername } from "@/lib/sharing";

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/;

export const getAccountSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.findUserById(context.userId);
    const accounts = await ctx.internalAdapter.findAccounts(context.userId);
    const sql = await getSql();
    const rows = await sql<{ username: string }>`
      select username from cinevo_profiles where user_id = ${context.userId}
    `;
    return {
      ok: true as const,
      name: user?.name ?? "",
      email: user?.email ?? "",
      hasPassword: accounts.some((account) => account.providerId === "credential" && Boolean(account.password)),
      username: rows[0]?.username ?? "",
    };
  });

export const saveAccountSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name?: string; username?: string; email?: string; currentPassword?: string; newPassword?: string }) => input)
  .handler(async ({ data, context }) => {
    const ctx = await auth.$context;
    const name = (data.name || "").trim();
    const username = data.username ? normalizeUsername(data.username) : "";
    const next = (data.newPassword || "").trim();
    const email = (data.email || "").trim().toLowerCase();
    if (name.length > 40) return { ok: false as const, error: "Name must be 40 characters or fewer." };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "Enter a valid email." };
    if (username && !USERNAME_RE.test(username)) {
      return { ok: false as const, error: "Usernames are 3–20 letters, numbers, or underscores, starting with a letter." };
    }
    if (next && next.length < 8) return { ok: false as const, error: "Use a password of at least 8 characters." };

    const current = await ctx.internalAdapter.findUserById(context.userId);
    if (email && email !== (current?.email || "").toLowerCase()) {
      const taken = await ctx.internalAdapter.findUserByEmail(email);
      if (taken?.user && taken.user.id !== context.userId) return { ok: false as const, error: "That email already has a house." };
    }

    const accounts = await ctx.internalAdapter.findAccounts(context.userId);
    const credential = accounts.find((account) => account.providerId === "credential");
    if (next && credential?.password) {
      const matches = await ctx.password.verify({ hash: credential.password, password: data.currentPassword || "" });
      if (!matches) return { ok: false as const, error: "Current password did not match." };
    }

    if (name || email) {
      try {
        await ctx.internalAdapter.updateUser(context.userId, {
          ...(name ? { name } : {}),
          ...(email && email !== (current?.email || "").toLowerCase() ? { email, emailVerified: false } : {}),
        });
      } catch {
        const changingEmail = Boolean(email && email !== (current?.email || "").toLowerCase());
        return { ok: false as const, error: changingEmail ? "That email already has a house." : "Could not save the account." };
      }
    }
    if (username) {
      const sql = await getSql();
      const taken = await sql<{ user_id: string }>`
        select user_id from cinevo_profiles where lower(username) = ${username.toLowerCase()} and user_id <> ${context.userId}
      `;
      if (taken.length) return { ok: false as const, error: "That username is taken." };
      try {
        await sql`
          insert into cinevo_profiles (user_id, username, display)
          values (${context.userId}, ${username}, ${name || username})
          on conflict (user_id) do update set username = excluded.username, display = excluded.display
        `;
      } catch {
        return { ok: false as const, error: "That username is taken." };
      }
    }
    if (!next) return { ok: true as const };
    const hash = await ctx.password.hash(next);
    if (credential) {
      await ctx.internalAdapter.updateAccount(credential.id, { password: hash });
    } else {
      await ctx.internalAdapter.linkAccount({
        userId: context.userId,
        providerId: "credential",
        accountId: context.userId,
        password: hash,
      });
    }
    return { ok: true as const };
  });
