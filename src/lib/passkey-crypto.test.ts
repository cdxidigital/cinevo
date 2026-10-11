import assert from "node:assert/strict";
import { test } from "node:test";
import { b64urlToBytes, bytesToB64url, derSigToRaw, pageOrigin, sha256, verifyAssertion } from "./passkey-crypto.ts";

function rawToDer(raw: Uint8Array): Uint8Array {
  const size = raw.length / 2;
  const encode = (part: Uint8Array) => {
    let i = 0;
    while (i < part.length - 1 && part[i] === 0) i += 1;
    const body = part[i] & 0x80 ? new Uint8Array([0, ...part.slice(i)]) : part.slice(i);
    const out = new Uint8Array(2 + body.length);
    out[0] = 0x02;
    out[1] = body.length;
    out.set(body, 2);
    return out;
  };
  const r = encode(raw.slice(0, size));
  const s = encode(raw.slice(size));
  const body = new Uint8Array(r.length + s.length);
  body.set(r, 0);
  body.set(s, r.length);
  const out = new Uint8Array(2 + body.length);
  out[0] = 0x30;
  out[1] = body.length;
  out.set(body, 2);
  return out;
}

test("base64url round trip and DER signature", () => {
  const raw = new Uint8Array(64);
  raw[0] = 0x80;
  raw[32] = 0x01;
  const der = rawToDer(raw);
  const back = derSigToRaw(der);
  assert.equal(bytesToB64url(back), bytesToB64url(raw));
  assert.deepEqual(b64urlToBytes(bytesToB64url(raw)), raw);
});

test("verifies an ES256 passkey assertion", async () => {
  const key = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", key.publicKey));
  const challenge = "challenge-value";
  const origin = "http://localhost:8080";
  const rpId = "localhost";
  const clientData = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge, origin }));
  const rpHash = await sha256(new TextEncoder().encode(rpId));
  const auth = new Uint8Array(37);
  auth.set(rpHash, 0);
  auth[32] = 0x01;
  const hash = await sha256(clientData);
  const signed = new Uint8Array(auth.length + hash.length);
  signed.set(auth, 0);
  signed.set(hash, auth.length);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, signed));
  const verified = await verifyAssertion({
    publicKeySpki: spki,
    algorithm: -7,
    authenticatorData: auth,
    clientDataJSON: clientData,
    signature: rawToDer(raw),
    challenge,
    origin,
    rpId,
  });
  assert.equal(verified.signCount, 0);
});

test("accepts only the actual, approved relying party", () => {
  const local = new Request("http://localhost:8080/api/passkey", {
    method: "POST", headers: { Origin: "http://localhost:8080" },
  });
  assert.deepEqual(pageOrigin(local), { origin: "http://localhost:8080", rpId: "localhost" });

  const spoofed = new Request("https://cinevo.fourtee2.digital/api/passkey", {
    method: "POST", headers: { Origin: "https://attacker.example" },
  });
  assert.equal(pageOrigin(spoofed), null);

  const unrelatedHost = new Request("https://attacker.example/api/passkey", {
    method: "POST", headers: { Origin: "https://attacker.example" },
  });
  assert.equal(pageOrigin(unrelatedHost), null);

  const prod = new Request("https://cinevo.fourtee2.digital/api/passkey", {
    method: "POST", headers: { Origin: "https://cinevo.fourtee2.digital" },
  });
  assert.deepEqual(pageOrigin(prod), { origin: "https://cinevo.fourtee2.digital", rpId: "cinevo.fourtee2.digital" });
});

async function signedFixture() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publicKeySpki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  const challenge = "trusted-challenge";
  const origin = "https://cinevo.fourtee2.digital";
  const rpId = "cinevo.fourtee2.digital";
  const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge, origin }));
  const authenticatorData = new Uint8Array(37);
  authenticatorData.set(await sha256(new TextEncoder().encode(rpId)), 0);
  authenticatorData[32] = 1;
  const signed = new Uint8Array(authenticatorData.length + 32);
  signed.set(authenticatorData);
  signed.set(await sha256(clientDataJSON), authenticatorData.length);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, signed));
  return { publicKeySpki, algorithm: -7, authenticatorData, clientDataJSON, signature, challenge, origin, rpId };
}

test("rejects mismatched passkey challenge", async () => {
  const fixture = await signedFixture();
  await assert.rejects(() => verifyAssertion({ ...fixture, challenge: "replayed-challenge" }), /challenge did not match/);
});
test("rejects mismatched passkey origin", async () => {
  const fixture = await signedFixture();
  await assert.rejects(() => verifyAssertion({ ...fixture, origin: "https://attacker.example" }), /different address/);
});
test("rejects a missing passkey user-presence flag", async () => {
  const fixture = await signedFixture();
  const authenticatorData = fixture.authenticatorData.slice();
  authenticatorData[32] = 0;
  await assert.rejects(() => verifyAssertion({ ...fixture, authenticatorData }), /not approved/);
});
test("rejects mismatched relying-party hash", async () => {
  const fixture = await signedFixture();
  await assert.rejects(() => verifyAssertion({ ...fixture, rpId: "attacker.example" }), /different address/);
});
test("rejects a tampered passkey signature", async () => {
  const fixture = await signedFixture();
  const signature = fixture.signature.slice();
  signature[0] ^= 0xff;
  await assert.rejects(() => verifyAssertion({ ...fixture, signature }), /does not match/);
});
