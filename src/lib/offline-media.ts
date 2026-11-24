const CACHE = "cinevo-offline-v1";

export async function cacheOfflineFile(url: string) {
  if (!url || !/^https?:\/\//.test(url) || typeof caches === "undefined") {
    return { ok: false as const, error: "This title cannot be saved on this device." };
  }
  try {
    const cache = await caches.open(CACHE);
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return { ok: false as const, error: "The file did not download." };
    await cache.put(url, res);
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "The file blocked a local copy. It can still play while you are online." };
  }
}

export async function cachedOfflineUrl(url: string) {
  if (!url || typeof caches === "undefined") return "";
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (!hit) return "";
    const blob = await hit.blob();
    return URL.createObjectURL(blob);
  } catch {
    return "";
  }
}

export async function dropOfflineFile(url: string) {
  if (!url || typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CACHE);
    await cache.delete(url);
  } catch {
    /* already gone */
  }
}

export async function offlineBytes() {
  if (typeof caches === "undefined") return 0;
  try {
    const cache = await caches.open(CACHE);
    const keys = await cache.keys();
    let total = 0;
    for (const key of keys) {
      const hit = await cache.match(key);
      const blob = await hit?.blob();
      total += blob?.size || 0;
    }
    return total;
  } catch {
    return 0;
  }
}
