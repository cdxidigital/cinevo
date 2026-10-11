import { bytesToB64url, sha256 } from "@/lib/passkey-crypto";

const DB = "cinevo-device-passkey";
const STORE = "keys";

type StoredKey = { privateKey: CryptoKey; counter: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open the passkey store."));
  });
}

async function putKey(id: string, value: StoredKey) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save the passkey."));
  });
  db.close();
}

async function readKeys(): Promise<Array<{ id: string; value: StoredKey }>> {
  const db = await openDb();
  const rows = await new Promise<Array<{ id: string; value: StoredKey }>>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).openCursor();
    const found: Array<{ id: string; value: StoredKey }> = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(found);
        return;
      }
      found.push({ id: String(cursor.key), value: cursor.value as StoredKey });
      cursor.continue();
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read the passkey."));
  });
  db.close();
  return rows;
}

async function assertion(privateKey: CryptoKey, origin: string, rpId: string, challenge: string, counter: number) {
  const clientData = new TextEncoder().encode(JSON.stringify({ type: "webauthn.get", challenge, origin }));
  const rpHash = await sha256(new TextEncoder().encode(rpId));
  const auth = new Uint8Array(37);
  auth.set(rpHash, 0);
  auth[32] = 0x01;
  new DataView(auth.buffer).setUint32(33, counter);
  const hash = await sha256(clientData);
  const signed = new Uint8Array(auth.length + hash.length);
  signed.set(auth, 0);
  signed.set(hash, auth.length);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, signed),
  );
  return {
    clientDataJSON: bytesToB64url(clientData),
    authenticatorData: bytesToB64url(auth),
    signature: bytesToB64url(signature),
  };
}

/** A passkey this browser can use when the platform prompt is unavailable. */
export async function createDeviceAssertion(origin: string, rpId: string, challenge: string) {
  const key = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const credentialId = bytesToB64url(crypto.getRandomValues(new Uint8Array(32)));
  const publicKey = bytesToB64url(new Uint8Array(await crypto.subtle.exportKey("spki", key.publicKey)));
  await putKey(credentialId, { privateKey: key.privateKey, counter: 1 });
  const signed = await assertion(key.privateKey, origin, rpId, challenge, 1);
  return { credentialId, publicKey, algorithm: "-7", ...signed };
}

export async function devicePasskeyIds() {
  const rows = await readKeys();
  return rows.map((row) => row.id);
}

export async function signDevicePasskey(id: string, origin: string, rpId: string, challenge: string) {
  const rows = await readKeys();
  const row = rows.find((item) => item.id === id);
  if (!row) throw new Error("No passkey on this browser yet. Create one first.");
  const counter = (row.value.counter || 0) + 1;
  await putKey(row.id, { privateKey: row.value.privateKey, counter });
  return { credentialId: row.id, ...(await assertion(row.value.privateKey, origin, rpId, challenge, counter)) };
}
