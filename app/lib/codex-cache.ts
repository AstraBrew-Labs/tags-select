import { getCatalogStorage, type CatalogStorage } from "./catalog-cache";
import { isCodexCatalog, type CodexCatalog } from "./director-codex";

export const CODEX_CACHE_KEY = "novelai-tags:director-codex:v1";
export const CODEX_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
type CacheEntry = { version: 1; cachedAt: number; expiresAt: number; data: CodexCatalog };

export function createCodexLoader({
  storage, fetchCodex, now = Date.now,
}: {
  storage: () => CatalogStorage | null;
  fetchCodex: () => Promise<unknown>;
  now?: () => number;
}) {
  let memory: CacheEntry | null = null;
  let pending: Promise<CodexCatalog> | null = null;
  let bypass = false;
  function target() {
    try { return storage(); } catch { return null; }
  }
  function remove() {
    try { target()?.removeItem(CODEX_CACHE_KEY); } catch { /* Storage can be blocked. */ }
  }
  function fresh(entry: CacheEntry, time: number) {
    return Number.isFinite(time) && entry.cachedAt <= time && time < entry.expiresAt;
  }
  function stored(time: number): CacheEntry | null {
    try {
      const raw = target()?.getItem(CODEX_CACHE_KEY);
      if (!raw) return null;
      // Bound parsing even when an extension or another tab writes malformed data.
      if (raw.length > 8_000_000) { remove(); return null; }
      const value: unknown = JSON.parse(raw);
      if (
        typeof value === "object" && value !== null &&
        "version" in value && value.version === 1 &&
        "cachedAt" in value && typeof value.cachedAt === "number" && Number.isFinite(value.cachedAt) &&
        "expiresAt" in value && value.expiresAt === value.cachedAt + CODEX_CACHE_TTL &&
        "data" in value && fresh(value as CacheEntry, time) && isCodexCatalog(value.data)
      ) return value as CacheEntry;
      remove();
    } catch { remove(); }
    return null;
  }
  function load(): Promise<CodexCatalog> {
    const time = now();
    if (memory && fresh(memory, time)) return Promise.resolve(memory.data);
    memory = bypass ? null : stored(time);
    if (memory) return Promise.resolve(memory.data);
    if (pending) return pending;
    pending = Promise.resolve().then(fetchCodex).then((data) => {
      if (!isCodexCatalog(data)) throw new Error("法典 API 返回的数据结构不正确。");
      const cachedAt = now();
      memory = { version: 1, cachedAt, expiresAt: cachedAt + CODEX_CACHE_TTL, data };
      bypass = false;
      try { target()?.setItem(CODEX_CACHE_KEY, JSON.stringify(memory)); } catch {
        // A full localStorage must not prevent browsing/copying the loaded data.
      }
      return data;
    }).finally(() => { pending = null; });
    return pending;
  }
  return {
    load,
    invalidate() { memory = null; bypass = true; remove(); },
  };
}

export const codexLoader = createCodexLoader({
  storage: getCatalogStorage,
  async fetchCodex() {
    const response = await fetch("/api/codex", { cache: "no-store" });
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new Error(
        typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
          ? data.error : "法典加载失败，请稍后重试。",
      );
    }
    return data;
  },
});
