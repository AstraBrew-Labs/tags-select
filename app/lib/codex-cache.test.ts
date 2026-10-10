import { describe, expect, test } from "bun:test";
import { CODEX_CACHE_KEY, CODEX_CACHE_TTL, createCodexLoader } from "./codex-cache";
import { codexFixture } from "./codex-fixtures.test";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
describe("one-week codex API cache", () => {
  test("deduplicates concurrent requests, persists and restores without extending expiration", async () => {
    const saved = storage();
    let time = 1000, requests = 0;
    const make = () => createCodexLoader({
      storage: () => saved, now: () => time,
      fetchCodex: async () => { requests++; return codexFixture; },
    });
    const loader = make();
    expect(await Promise.all([loader.load(), loader.load()])).toEqual([codexFixture, codexFixture]);
    time += CODEX_CACHE_TTL - 1;
    expect(await make().load()).toEqual(codexFixture);
    expect(requests).toBe(1);
    expect(JSON.parse(saved.getItem(CODEX_CACHE_KEY)!).cachedAt).toBe(1000);
    time++;
    await make().load();
    expect(requests).toBe(2);
  });
  test("corrupt, future-dated, unknown-version and invalid catalogs are not used", async () => {
    const saved = storage();
    const good = { version: 1, cachedAt: 1000, expiresAt: 1000 + CODEX_CACHE_TTL, data: codexFixture };
    for (const value of [
      "{broken", { ...good, version: 3 }, { ...good, data: {} },
      { ...good, cachedAt: 3000, expiresAt: 3000 + CODEX_CACHE_TTL },
      { ...good, expiresAt: 999999999 },
    ]) {
      saved.setItem(CODEX_CACHE_KEY, typeof value === "string" ? value : JSON.stringify(value));
      let requests = 0;
      const loader = createCodexLoader({
        storage: () => saved, now: () => 2000,
        fetchCodex: async () => { requests++; return codexFixture; },
      });
      await loader.load();
      expect(requests).toBe(1);
    }
  });
  test("storage denial and quota errors still allow memory caching", async () => {
    let requests = 0;
    const loader = createCodexLoader({
      storage: () => ({
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("quota"); },
        removeItem: () => { throw new Error("denied"); },
      }),
      fetchCodex: async () => { requests++; return codexFixture; },
    });
    await loader.load();
    await loader.load();
    expect(requests).toBe(1);
  });
  test("network errors and invalid responses do not poison subsequent retries", async () => {
    const saved = storage();
    let requests = 0;
    const loader = createCodexLoader({
      storage: () => saved,
      fetchCodex: async () => { requests++; if (requests === 1) throw new Error("offline"); return requests === 2 ? {} : codexFixture; },
    });
    await expect(loader.load()).rejects.toThrow("offline");
    await expect(loader.load()).rejects.toThrow("数据结构");
    expect(saved.getItem(CODEX_CACHE_KEY)).toBeNull();
    expect(await loader.load()).toEqual(codexFixture);
  });
  test("explicit retry invalidates only the codex cache", async () => {
    const saved = storage();
    saved.setItem("favorites", "keep");
    let requests = 0;
    const loader = createCodexLoader({
      storage: () => saved,
      fetchCodex: async () => { requests++; return codexFixture; },
    });
    await loader.load();
    loader.invalidate();
    expect(saved.getItem(CODEX_CACHE_KEY)).toBeNull();
    await loader.load();
    expect(requests).toBe(2);
    expect(saved.getItem("favorites")).toBe("keep");
  });
});
