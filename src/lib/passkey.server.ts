import { auth, SESSION_TOKEN_COOKIE } from "@/lib/auth/server";
import { getSql } from "@/lib/db";
import { b64urlToBytes, bytesToB64url, pageOrigin, verifyAssertion } from "@/lib/passkey-crypto";

type PasskeyRow = {
  credential_id: string;
  user_id: string;
  public_key: string;
  algorithm: number;
  counter: number;
};

function randomId() {
  return bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function signedToken(raw: string) {
  const ctx = await auth.$context;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ctx.secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  let bin = "";
  for (const byte of sig) bin += String.fromCharCode(byte);
  return `${raw}.${btoa(bin)}`;
}

export async function issueSession(userId: string) {
  const ctx = await auth.$context;
  const session = await ctx.internalAdapter.createSession(userId);
  if (!session?.token) throw new Error("Could not start a session.");
  const token = await signedToken(session.token);
  const cookie = `${SESSION_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${60 * 60 * 24 * 7}`;
  return { token, cookie };
}

export async function userFromRequest(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user?.id) return session.user.id;
  const header = request.headers.get("authorization") || "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  let decoded = header.slice(7).trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* already decoded */
  }
  const token = decoded.split(".")[0];
  if (!token) return null;
  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findSession(token);
  return found?.user?.id ?? null;
}

export async function newChallenge() {
  const sql = await getSql();
  const id = randomId();
  const challenge = randomId();
  await sql`delete from cinevo_webauthn_challenge where expires_at < now()`;
  await sql`insert into cinevo_webauthn_challenge (id, challenge, expires_at) values (${id}, ${challenge}, now() + interval '5 minutes')`;
  return { challengeId: id, challenge };
}

async function takeChallenge(id: string) {
  const sql = await getSql();
  const rows = await sql<{ challenge: string }>`
    delete from cinevo_webauthn_challenge
    where id = ${id} and expires_at > now()
    returning challenge
  `;
  return rows[0]?.challenge ?? null;
}

export async function registerPasskey(request: Request, body: {
  challengeId?: string;
  email?: string;
  name?: string;
  credentialId?: string;
  publicKey?: string;
  algorithm?: number;
  clientDataJSON?: string;
  authenticatorData?: string;
  signature?: string;
}) {
  const where = pageOrigin(request);
  if (!where) throw new Error("This page could not confirm its address. Reload and try again.");
  const email = (body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter the email for this house.");
  if (!body.challengeId || !body.credentialId || !body.publicKey || !body.clientDataJSON || !body.authenticatorData || !body.signature) {
    throw new Error("Passkey response was incomplete.");
  }
  const challenge = await takeChallenge(body.challengeId);
  if (!challenge) throw new Error("That passkey prompt expired. Try again.");
  const algorithm = Number(body.algorithm) === -257 ? -257 : -7;
  await verifyAssertion({
    publicKeySpki: b64urlToBytes(body.publicKey),
    algorithm,
    authenticatorData: b64urlToBytes(body.authenticatorData),
    clientDataJSON: b64urlToBytes(body.clientDataJSON),
    signature: b64urlToBytes(body.signature),
    challenge,
    origin: where.origin,
    rpId: where.rpId,
  });
  // A passkey proves possession of a key, not ownership of an email address.
  // Only an authenticated owner can attach a credential to an existing account.
  const signedIn = await userFromRequest(request);
  if (!signedIn) throw new Error("Create or sign in to your account first, then add a passkey.");
  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(email);
  if (!existing?.user || existing.user.id !== signedIn) {
    throw new Error("That email does not match the signed-in account.");
  }
  const userId = signedIn;
  const sql = await getSql();
  const taken = await sql<{ user_id: string }>`select user_id from cinevo_passkey where credential_id = ${body.credentialId}`;
  if (taken[0] && taken[0].user_id !== userId) throw new Error("That passkey is already on another house.");
  if (!taken[0]) {
    await sql`
      insert into cinevo_passkey (credential_id, user_id, public_key, algorithm, counter)
      values (${body.credentialId}, ${userId}, ${body.publicKey}, ${algorithm}, ${0})
    `;
  }
  return issueSession(userId);
}

export async function loginPasskey(request: Request, body: {
  challengeId?: string;
  credentialId?: string;
  clientDataJSON?: string;
  authenticatorData?: string;
  signature?: string;
}) {
  const where = pageOrigin(request);
  if (!where) throw new Error("This page could not confirm its address. Reload and try again.");
  if (!body.challengeId || !body.credentialId || !body.clientDataJSON || !body.authenticatorData || !body.signature) {
    throw new Error("Passkey response was incomplete.");
  }
  const challenge = await takeChallenge(body.challengeId);
  if (!challenge) throw new Error("That passkey prompt expired. Try again.");
  const sql = await getSql();
  const rows = await sql<PasskeyRow>`select credential_id, user_id, public_key, algorithm, counter from cinevo_passkey where credential_id = ${body.credentialId}`;
  const row = rows[0];
  if (!row) throw new Error("No passkey on this house matches that one. Create an account first.");
  const verified = await verifyAssertion({
    publicKeySpki: b64urlToBytes(row.public_key),
    algorithm: Number(row.algorithm) === -257 ? -257 : -7,
    authenticatorData: b64urlToBytes(body.authenticatorData),
    clientDataJSON: b64urlToBytes(body.clientDataJSON),
    signature: b64urlToBytes(body.signature),
    challenge,
    origin: where.origin,
    rpId: where.rpId,
  });
  const next = verified.signCount > Number(row.counter) ? verified.signCount : Number(row.counter);
  if (verified.signCount > 0 && Number(row.counter) > 0 && verified.signCount <= Number(row.counter)) {
    throw new Error("That passkey looks copied. Use the original device.");
  }
  await sql`update cinevo_passkey set counter = ${next} where credential_id = ${row.credential_id}`;
  return issueSession(row.user_id);
}

export async function openDesk() {
  const sql = await getSql();
  const secret = randomId();
  await sql`delete from cinevo_desk where expires_at < now()`;
  await sql`insert into cinevo_desk (secret, status, expires_at) values (${secret}, 'pending', now() + interval '3 minutes')`;
  return { secret };
}

export async function readDesk(secret: string) {
  const sql = await getSql();
  // DELETE RETURNING consumes the *previous* token atomically, so concurrent
  // QR pollers can never both receive a usable session token.
  const claimed = await sql<{ token: string | null }>`
    delete from cinevo_desk
    where secret = ${secret} and status = 'approved' and expires_at > now()
    returning token
  `;
  if (claimed[0]?.token) return { status: "approved" as const, token: claimed[0].token };
  const rows = await sql<{ status: string }>`
    select status from cinevo_desk where secret = ${secret} and expires_at > now()
  `;
  return rows[0]?.status === "pending" ? { status: "pending" as const } : { status: "expired" as const };
}

export async function approveDesk(request: Request, secret: string) {
  const userId = await userFromRequest(request);
  if (!userId) throw new Error("Sign in on this phone first.");
  const sql = await getSql();
  const rows = await sql<{ status: string }>`
    select status from cinevo_desk where secret = ${secret} and status = 'pending' and expires_at > now()
  `;
  if (!rows[0]) throw new Error("That code expired or has already been approved. Scan a new one.");
  const session = await issueSession(userId);
  const saved = await sql<{ secret: string }>`
    update cinevo_desk set status = 'approved', token = ${session.token}
    where secret = ${secret} and status = 'pending' and expires_at > now()
    returning secret
  `;
  if (!saved.length) throw new Error("That code was already used. Scan a new one.");
  return { ok: true as const };
}
