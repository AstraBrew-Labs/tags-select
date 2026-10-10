import type { DatasetCacheEntry, DatasetStorage } from "./dataset-storage";

export const DATASET_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
export const DATASET_RETRY_DELAY = 60_000;
export type DatasetState<T> = { data: T | null; loading: boolean; error: string | null };

export function createDatasetLoader<T>({
  key, validate, loadLocal, fetchRemote, storage, now = Date.now,
}: {
  key: string;
  validate: (value: unknown) => value is T;
  loadLocal: () => Promise<unknown>;
  fetchRemote: () => Promise<unknown>;
  storage: DatasetStorage;
  now?: () => number;
}) {
  const initial: DatasetState<T> = { data: null, loading: true, error: null };
  let state = initial;
  let entry: DatasetCacheEntry<T> | null = null;
  let started: Promise<void> | null = null;
  let pending: Promise<void> | null = null;
  let nextAttempt = 0;
  let bypassStorage = false;
  const listeners = new Set<() => void>();
  function publish(data: T | null, error: string | null = null) {
    state = { data, loading: false, error: data ? null : error };
    listeners.forEach((listener) => listener());
  }
  function fresh() {
    return entry && entry.cachedAt <= now() && now() < entry.cachedAt + DATASET_CACHE_TTL;
  }
  function refresh(force = false): Promise<void> {
    if (pending) return pending;
    if (!force && (fresh() || now() < nextAttempt)) return Promise.resolve();
    nextAttempt = now() + DATASET_RETRY_DELAY;
    pending = Promise.resolve().then(fetchRemote).then(async (data) => {
      if (!validate(data)) throw new Error("API 返回的数据结构不正确。");
      entry = { version: 1, cachedAt: now(), data };
      publish(data);
      try { await storage.write(key, entry); } catch { /* Memory remains usable. */ }
    }).catch((error: unknown) => {
      if (!state.data && !state.loading) {
        publish(null, error instanceof Error ? error.message : "数据暂不可用。");
      }
    }).finally(() => { pending = null; });
    return pending;
  }
  function start(): Promise<void> {
    if (started) return started;
    started = (async () => {
      // Bound startup latency when browser storage is blocked.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const saved = await Promise.race([
          bypassStorage ? Promise.resolve(null) : storage.read(key),
          new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 150); }),
        ]);
        if (
          typeof saved === "object" && saved !== null &&
          "version" in saved && saved.version === 1 &&
          "cachedAt" in saved && typeof saved.cachedAt === "number" &&
          Number.isFinite(saved.cachedAt) && saved.cachedAt <= now() &&
          "data" in saved && validate(saved.data)
        ) {
          entry = { version: 1, cachedAt: saved.cachedAt, data: saved.data };
          publish(entry.data);
        }
      } catch { /* Storage failure falls back to the shipped snapshot. */ }
      finally { clearTimeout(timer); }
      bypassStorage = false;
      void refresh();
      if (!state.data) {
        try {
          const local = await loadLocal();
          if (!validate(local)) throw new Error("本地数据结构不正确。");
          // A faster API result must not be overwritten by the local snapshot.
          if (!state.data) publish(local);
        } catch (error: unknown) {
          if (!state.data) publish(null, error instanceof Error ? error.message : "本地数据加载失败。");
        }
      }
    })();
    return started;
  }
  return {
    start, refresh,
    getSnapshot: () => state,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async retry() {
      // Retain good data during retries, including expired API snapshots.
      started = null;
      entry = null;
      nextAttempt = 0;
      bypassStorage = true;
      await start();
      await pending;
    },
  };
}
