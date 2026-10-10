import { describe, expect, test } from "bun:test";
import { createDatasetLoader, DATASET_CACHE_TTL, DATASET_RETRY_DELAY } from "./dataset-loader";
import type { DatasetStorage } from "./dataset-storage";

type Data = { value: string };
const local: Data = { value: "local" }, remote: Data = { value: "remote" };
const validate = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && "value" in value && typeof value.value === "string";
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function store() {
  const values = new Map<string, unknown>();
  const storage: DatasetStorage = {
    read: async (key) => values.get(key),
    write: async (key, value) => { values.set(key, value); },
  };
  return { values, storage };
}
function setup(options: {
  loadLocal?: () => Promise<unknown>; fetchRemote?: () => Promise<unknown>;
  storage?: DatasetStorage; now?: () => number;
} = {}) {
  return createDatasetLoader({
    key: "test", validate, storage: options.storage ?? store().storage,
    loadLocal: options.loadLocal ?? (async () => local),
    fetchRemote: options.fetchRemote ?? (async () => remote),
    now: options.now ?? (() => 1000),
  });
}

describe("local-first persistent datasets", () => {
  test("shows the local snapshot before a delayed API, then replaces and persists it", async () => {
    const api = deferred<unknown>(), saved = store();
    let requests = 0, updates = 0;
    const loader = setup({
      storage: saved.storage,
      fetchRemote: () => { requests++; return api.promise; },
    });
    const unsubscribe = loader.subscribe(() => { updates++; });
    await Promise.all([loader.start(), loader.start()]);
    expect(loader.getSnapshot()).toEqual({ data: local, loading: false, error: null });
    expect(requests).toBe(1);
    const work = loader.refresh();
    api.resolve(remote);
    await work;
    expect(loader.getSnapshot().data).toEqual(remote);
    expect(saved.values.get("test")).toEqual({ version: 1, cachedAt: 1000, data: remote });
    expect(updates).toBe(2);
    unsubscribe();
  });
  test("a new page restores persistent API data without local or network requests", async () => {
    const saved = store();
    saved.values.set("test", { version: 1, cachedAt: 1000, data: remote });
    let calls = 0;
    const loader = setup({
      storage: saved.storage, now: () => 2000,
      loadLocal: async () => { calls++; return local; },
      fetchRemote: async () => { calls++; return remote; },
    });
    await loader.start();
    expect(loader.getSnapshot().data).toEqual(remote);
    expect(calls).toBe(0);
  });
  test("expired cache remains usable offline and revalidation is throttled", async () => {
    const saved = store();
    saved.values.set("test", { version: 1, cachedAt: 1000, data: remote });
    let time = 1000 + DATASET_CACHE_TTL, requests = 0;
    const loader = setup({
      storage: saved.storage, now: () => time,
      fetchRemote: async () => { requests++; throw new Error("offline"); },
    });
    await loader.start();
    await loader.refresh();
    expect(loader.getSnapshot()).toEqual({ data: remote, loading: false, error: null });
    await loader.refresh();
    expect(requests).toBe(1);
    time += DATASET_RETRY_DELAY;
    await loader.refresh();
    expect(requests).toBe(2);
  });
  test("invalid API data never overwrites local data or poisons persistent storage", async () => {
    const saved = store();
    const loader = setup({ storage: saved.storage, fetchRemote: async () => ({ invalid: true }) });
    await loader.start();
    await loader.refresh();
    expect(loader.getSnapshot().data).toEqual(local);
    expect(loader.getSnapshot().error).toBeNull();
    expect(saved.values.size).toBe(0);
  });
  test("corrupt, wrong-version and future caches fall back to local data", async () => {
    for (const value of [
      "bad", { version: 2, cachedAt: 1000, data: remote },
      { version: 1, cachedAt: 2000, data: remote },
      { version: 1, cachedAt: 1000, data: {} },
    ]) {
      const saved = store();
      saved.values.set("test", value);
      const loader = setup({
        storage: saved.storage, fetchRemote: async () => { throw new Error("offline"); },
      });
      await loader.start();
      await loader.refresh();
      expect(loader.getSnapshot().data).toEqual(local);
    }
  });
  test("storage denial and quota errors keep API data usable in memory", async () => {
    const loader = setup({
      storage: {
        read: async () => { throw new Error("denied"); },
        write: async () => { throw new Error("quota"); },
      },
    });
    await loader.start();
    await loader.refresh();
    expect(loader.getSnapshot().data).toEqual(remote);
  });
  test("a slow local resource cannot overwrite a faster valid API response", async () => {
    const snapshot = deferred<unknown>();
    const loader = setup({ loadLocal: () => snapshot.promise });
    const start = loader.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loader.getSnapshot().data).toEqual(remote);
    snapshot.resolve(local);
    await start;
    expect(loader.getSnapshot().data).toEqual(remote);
  });
  test("local failure still allows background API recovery", async () => {
    const api = deferred<unknown>();
    const loader = setup({
      loadLocal: async () => { throw new Error("snapshot unavailable"); },
      fetchRemote: () => api.promise,
    });
    await loader.start();
    expect(loader.getSnapshot().error).toBe("snapshot unavailable");
    const work = loader.refresh();
    api.resolve(remote);
    await work;
    expect(loader.getSnapshot()).toEqual({ data: remote, loading: false, error: null });
  });
  test("explicit retry retains visible data and bypasses a fresh stored cache once", async () => {
    const saved = store(), api = deferred<unknown>();
    saved.values.set("test", { version: 1, cachedAt: 1000, data: remote });
    let requests = 0;
    const loader = setup({
      storage: saved.storage, fetchRemote: () => { requests++; return api.promise; },
    });
    await loader.start();
    const retry = loader.retry();
    expect(loader.getSnapshot().data).toEqual(remote);
    api.resolve({ value: "updated" });
    await retry;
    expect(loader.getSnapshot().data).toEqual({ value: "updated" });
    expect(requests).toBe(1);
  });
});
