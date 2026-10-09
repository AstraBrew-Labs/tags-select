import { describe, expect, test } from "bun:test";
import type { CatalogResponse } from "./catalog-types";
import {
  CATALOG_CACHE_KEY,
  CATALOG_CACHE_TTL,
  createCatalogLoader,
  isCatalogResponse,
  readCatalogCache,
  type CatalogStorage,
} from "./catalog-cache";

const data: CatalogResponse = {
  categories: [
    {
      id: "body",
      sourceKey: "Body",
      nameZh: "身体&发型",
      nameEn: "Body & Hair",
      count: 1,
    },
  ],
  groups: [{ id: "body:group", categoryId: "body", nameZh: "发型", count: 1 }],
  tags: [
    {
      id: "body:tag",
      categoryId: "body",
      groupId: "body:group",
      zh: "长发",
      en: "long hair",
      aliases: [],
      note: null,
      imageUrl: null,
      popular: true,
    },
  ],
  source: null,
};
function memoryStorage() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
function entry(cachedAt: number, payload: unknown = data) {
  return JSON.stringify({
    version: 1,
    cachedAt,
    expiresAt: cachedAt + CATALOG_CACHE_TTL,
    data: payload,
  });
}

describe("one-week API catalog cache", () => {
  test("persists a successful fetch, then serves memory and reloads from storage", async () => {
    const storage = memoryStorage();
    let requests = 0;
    let time = 1000;
    const makeLoader = () =>
      createCatalogLoader({
        storage: () => storage,
        now: () => time,
        fetchCatalog: async () => {
          requests++;
          return data;
        },
      });
    const first = makeLoader();
    expect(await first.load()).toEqual(data);
    expect(requests).toBe(1);
    const saved = JSON.parse(storage.getItem(CATALOG_CACHE_KEY)!);
    expect(saved.cachedAt).toBe(time);
    expect(saved.expiresAt).toBe(time + CATALOG_CACHE_TTL);
    time += CATALOG_CACHE_TTL - 1;
    expect(await first.load()).toEqual(data);
    expect(await makeLoader().load()).toEqual(data);
    expect(requests).toBe(1);
    expect(JSON.parse(storage.getItem(CATALOG_CACHE_KEY)!).cachedAt).toBe(1000);
  });
  test("expires at exactly seven days and fetches fresh API data", async () => {
    const storage = memoryStorage();
    let time = 1000;
    let requests = 0;
    const loader = createCatalogLoader({
      storage: () => storage,
      now: () => time,
      fetchCatalog: async () => {
        requests++;
        return data;
      },
    });
    await loader.load();
    time += CATALOG_CACHE_TTL;
    await loader.load();
    expect(requests).toBe(2);
    expect(readCatalogCache(storage, time)?.cachedAt).toBe(time);
  });
  test("invalidates malformed, wrong-version, future-dated and invalid payload caches", async () => {
    for (const raw of [
      "not JSON",
      JSON.stringify({ version: 2 }),
      entry(2000),
      entry(0, { categories: [], groups: [], tags: [null], source: null }),
      JSON.stringify({
        version: 1,
        cachedAt: 0,
        expiresAt: CATALOG_CACHE_TTL * 2,
        data,
      }),
    ]) {
      const storage = memoryStorage();
      storage.setItem(CATALOG_CACHE_KEY, raw);
      expect(readCatalogCache(storage, 1000)).toBeNull();
      expect(storage.getItem(CATALOG_CACHE_KEY)).toBeNull();
    }
    const storage = memoryStorage();
    storage.setItem(CATALOG_CACHE_KEY, "broken");
    let requests = 0;
    const loader = createCatalogLoader({
      storage: () => storage,
      now: () => 1000,
      fetchCatalog: async () => {
        requests++;
        return data;
      },
    });
    expect(await loader.load()).toEqual(data);
    expect(requests).toBe(1);
  });
  test("rejects broken tag fields and category/group relationships", () => {
    expect(isCatalogResponse(data)).toBe(true);
    expect(
      isCatalogResponse({
        ...data,
        tags: [{ ...data.tags[0], aliases: null }],
      }),
    ).toBe(false);
    expect(
      isCatalogResponse({
        ...data,
        tags: [{ ...data.tags[0], groupId: "missing" }],
      }),
    ).toBe(false);
    expect(isCatalogResponse({ ...data, source: {} })).toBe(false);
  });
  test("caching time starts after a slow API response completes", async () => {
    let time = 1000;
    const storage = memoryStorage();
    const loader = createCatalogLoader({
      storage: () => storage,
      now: () => time,
      fetchCatalog: async () => {
        time += 10_000;
        return data;
      },
    });
    await loader.load();
    expect(readCatalogCache(storage, time)?.cachedAt).toBe(11_000);
  });
  test("deduplicates simultaneous consumers and Strict Mode effect replays", async () => {
    let resolve!: (value: CatalogResponse) => void;
    let requests = 0;
    const response = new Promise<CatalogResponse>((done) => {
      resolve = done;
    });
    const loader = createCatalogLoader({
      storage: () => memoryStorage(),
      fetchCatalog: () => {
        requests++;
        return response;
      },
    });
    const first = loader.load(),
      second = loader.load();
    await Promise.resolve();
    expect(requests).toBe(1);
    resolve(data);
    expect(await first).toEqual(data);
    expect(await second).toEqual(data);
  });
  test("storage denial and quota errors keep fetched data usable in memory", async () => {
    for (const storage of [
      null,
      {
        getItem() {
          throw new Error("blocked");
        },
        setItem() {
          throw new Error("quota");
        },
        removeItem() {
          throw new Error("blocked");
        },
      },
      {
        getItem() {
          return null;
        },
        setItem() {
          throw new Error("quota");
        },
        removeItem() {},
      },
    ] as (CatalogStorage | null)[]) {
      let requests = 0;
      const loader = createCatalogLoader({
        storage: () => storage,
        fetchCatalog: async () => {
          requests++;
          return data;
        },
      });
      expect(await loader.load()).toEqual(data);
      expect(await loader.load()).toEqual(data);
      expect(requests).toBe(1);
    }
    const loader = createCatalogLoader({
      storage() {
        throw new Error("blocked getter");
      },
      fetchCatalog: async () => data,
    });
    expect(await loader.load()).toEqual(data);
  });
  test("failed or invalid API responses are not cached and can retry", async () => {
    for (const fail of [
      () => {
        throw new Error("offline");
      },
      () => ({ categories: [], groups: [], tags: [null] }),
    ]) {
      const storage = memoryStorage();
      let requests = 0;
      const loader = createCatalogLoader({
        storage: () => storage,
        fetchCatalog: async () => {
          requests++;
          return requests === 1 ? fail() : data;
        },
      });
      await expect(loader.load()).rejects.toThrow();
      expect(storage.getItem(CATALOG_CACHE_KEY)).toBeNull();
      expect(await loader.load()).toEqual(data);
      expect(requests).toBe(2);
    }
  });
  test("manual reload bypasses old data even when cache removal is denied", async () => {
    const stored = memoryStorage();
    stored.setItem(CATALOG_CACHE_KEY, entry(1000));
    const storage: CatalogStorage = {
      getItem: stored.getItem,
      setItem: stored.setItem,
      removeItem() {
        throw new Error("blocked removal");
      },
    };
    let requests = 0;
    const loader = createCatalogLoader({
      storage: () => storage,
      now: () => 2000,
      fetchCatalog: async () => {
        requests++;
        return data;
      },
    });
    await loader.load();
    expect(requests).toBe(0);
    loader.invalidate();
    await loader.load();
    expect(requests).toBe(1);
  });
  test("manual reload clears only the catalog and fetches again", async () => {
    const storage = memoryStorage();
    storage.setItem("novelai-tags:favorites:v1", '["favorite"]');
    let requests = 0;
    const loader = createCatalogLoader({
      storage: () => storage,
      fetchCatalog: async () => {
        requests++;
        return data;
      },
    });
    await loader.load();
    loader.invalidate();
    expect(storage.getItem(CATALOG_CACHE_KEY)).toBeNull();
    expect(storage.getItem("novelai-tags:favorites:v1")).toBe('["favorite"]');
    await loader.load();
    expect(requests).toBe(2);
  });
});
