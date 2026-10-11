import { describe, expect, test } from "bun:test";
import { createCharacterImageLoader } from "./character-image-cache";
import {
  CHARACTER_IMAGE_CACHE_KEY,
  CHARACTER_IMAGE_CACHE_VERSION,
  CHARACTER_IMAGE_CACHE_TTL,
  CHARACTER_IMAGE_CACHE_MAX_ENTRIES,
} from "./character-image-types";

const imageUrl = "https://cdn.donmai.us/180x180/character.jpg";

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let time = 1_000;
  const calls: string[] = [];
  const options = {
    storage: () => storage,
    now: () => time,
    fetchImage: async (tag: string) => {
      calls.push(tag);
      return { tag, imageUrl, cached: false, cachedAt: time };
    },
  };
  return {
    values, options, calls,
    loader: createCharacterImageLoader(options),
    setTime: (next: number) => { time = next; },
  };
}

describe("one-week character image URL cache", () => {
  test("general, weighted, composite and artist tags reuse the canonical one-week cache", async () => {
    const s = setup();
    await s.loader.load("{long hair, blue eyes}");
    await s.loader.load("long_hair");
    await s.loader.load("artist:anmi");
    await createCharacterImageLoader(s.options).load("anmi");
    expect(s.calls).toEqual(["long_hair", "anmi"]);
  });
  test("unsupported query operators do not request or cache an image", async () => {
    const s = setup();
    expect(await s.loader.load("rating:e")).toBeNull();
    expect(s.calls).toHaveLength(0);
    expect(s.values.has(CHARACTER_IMAGE_CACHE_KEY)).toBe(false);
  });
  test("verified image aliases share canonical cache without using the old missing record", async () => {
    const s = setup();
    const original = "jouga_maya_(gochuumon_wa_usagi_desu_ka?)";
    s.values.set(CHARACTER_IMAGE_CACHE_KEY, JSON.stringify({
      version: CHARACTER_IMAGE_CACHE_VERSION,
      entries: [{ tag: original, cachedAt: 1_000, imageUrl: null }],
    }));
    expect(await s.loader.load(original)).toBe(imageUrl);
    expect(await s.loader.load("jouga_maya")).toBe(imageUrl);
    expect(s.calls).toEqual(["jouga_maya"]);
  });
  test("normalizes tags and reads persisted URLs after a page reload", async () => {
    const s = setup();
    expect(await s.loader.load(" Misaka Mikoto ")).toBe(imageUrl);
    expect(await s.loader.load("misaka_mikoto")).toBe(imageUrl);
    expect(await createCharacterImageLoader(s.options).load("misaka mikoto")).toBe(imageUrl);
    expect(s.calls).toEqual(["misaka_mikoto"]);
    expect(s.values.has(CHARACTER_IMAGE_CACHE_KEY)).toBe(true);
  });
  test("expires exactly one week from retrieval without extending on read", async () => {
    const s = setup();
    await s.loader.load("a");
    s.setTime(1_000 + CHARACTER_IMAGE_CACHE_TTL - 1);
    await s.loader.load("a");
    expect(s.calls).toHaveLength(1);
    s.setTime(1_000 + CHARACTER_IMAGE_CACHE_TTL);
    await s.loader.load("a");
    expect(s.calls).toHaveLength(2);
  });
  test("deduplicates simultaneous requests for the same character", async () => {
    const s = setup();
    const images = await Promise.all([
      s.loader.load("misaka mikoto"), s.loader.load("misaka_mikoto"),
    ]);
    expect(images).toEqual([imageUrl, imageUrl]);
    expect(s.calls).toHaveLength(1);
  });
  test("caches a missing image but not network errors", async () => {
    const s = setup();
    let requests = 0;
    const loader = createCharacterImageLoader({
      ...s.options,
      fetchImage: async (tag) => {
        requests++;
        if (requests === 1) throw new Error("Unavailable");
        return { tag, imageUrl: null, cached: false, cachedAt: 1_000 };
      },
    });
    await expect(loader.load("a")).rejects.toThrow("Unavailable");
    expect(await loader.load("a")).toBeNull();
    expect(await loader.load("a")).toBeNull();
    expect(requests).toBe(2);
  });
  test("invalid data and URLs are never persisted", async () => {
    for (const data of [
      { tag: "wrong", imageUrl, cached: false, cachedAt: 1_000 },
      { tag: "a", imageUrl: "https://other.example/a.jpg", cached: false, cachedAt: 1_000 },
      { tag: "a", imageUrl: "https://cdn.donmai.us/a.mp4", cached: false, cachedAt: 1_000 },
      { tag: "a", imageUrl: 7, cached: false, cachedAt: 1_000 },
      { tag: "a", imageUrl, cached: false },
      { tag: "a", imageUrl, cached: false, cachedAt: -1 },
      { tag: "a", imageUrl, cached: false, cachedAt: Infinity },
    ]) {
      const s = setup();
      const loader = createCharacterImageLoader({
        ...s.options, fetchImage: async () => data,
      });
      await expect(loader.load("a")).rejects.toThrow("格式");
      expect(s.values.has(CHARACTER_IMAGE_CACHE_KEY)).toBe(false);
    }
  });
  test("corrupted, expired and future-dated cache entries fall back to API", async () => {
    for (const value of [
      "{broken",
      JSON.stringify({ version: 1, entries: [] }),
      JSON.stringify({
        version: CHARACTER_IMAGE_CACHE_VERSION,
        entries: [
          null,
          { tag: "a", cachedAt: 1_001, imageUrl },
          { tag: "a", cachedAt: 1_000 - CHARACTER_IMAGE_CACHE_TTL, imageUrl },
          { tag: "a", cachedAt: 1_000, imageUrl: "https://other.example/a.jpg" },
        ],
      }),
    ]) {
      const s = setup();
      s.values.set(CHARACTER_IMAGE_CACHE_KEY, value);
      expect(await s.loader.load("a")).toBe(imageUrl);
      expect(s.calls).toHaveLength(1);
    }
  });
  test("restricted storage still uses the memory cache", async () => {
    const s = setup();
    const loader = createCharacterImageLoader({
      ...s.options,
      storage: () => { throw new Error("Denied"); },
    });
    await loader.load("a");
    await loader.load("a");
    expect(s.calls).toHaveLength(1);
  });
  test("cache stays bounded and removes expired records on write", async () => {
    const s = setup();
    s.values.set(CHARACTER_IMAGE_CACHE_KEY, JSON.stringify({
      version: CHARACTER_IMAGE_CACHE_VERSION,
      entries: Array.from({ length: CHARACTER_IMAGE_CACHE_MAX_ENTRIES }, (_, i) => ({
        tag: `character_${i}`, imageUrl, cachedAt: 1_000,
      })),
    }));
    await s.loader.load("new_character");
    const first = JSON.parse(s.values.get(CHARACTER_IMAGE_CACHE_KEY)!);
    expect(first.entries).toHaveLength(CHARACTER_IMAGE_CACHE_MAX_ENTRIES);
    expect(first.entries[0].tag).toBe("character_1");
    s.setTime(1_000 + CHARACTER_IMAGE_CACHE_TTL);
    await s.loader.load("other_character");
    const next = JSON.parse(s.values.get(CHARACTER_IMAGE_CACHE_KEY)!);
    expect(next.entries.map((entry: { tag: string }) => entry.tag)).toEqual(["other_character"]);
  });
  test("at most three different image requests run concurrently", async () => {
    const s = setup();
    let active = 0;
    let maxActive = 0;
    const loader = createCharacterImageLoader({
      ...s.options,
      fetchImage: async (tag) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active--;
        return { tag, imageUrl, cached: false, cachedAt: 1_000 };
      },
    });
    await Promise.all(Array.from({ length: 10 }, (_, i) => loader.load(`a_${i}`)));
    expect(maxActive).toBe(3);
    expect(active).toBe(0);
  });
  test("clearing persisted URLs invalidates memory and requests fresh upstream data", async () => {
    const s = setup();
    const refreshes: boolean[] = [];
    const loader = createCharacterImageLoader({
      ...s.options,
      fetchImage: async (tag, options) => {
        refreshes.push(options.refresh);
        return {
          tag, cached: false, cachedAt: 1_000,
          imageUrl: `https://cdn.donmai.us/${refreshes.length}.jpg`,
        };
      },
    });
    expect(await loader.load("a")).toBe("https://cdn.donmai.us/1.jpg");
    expect(await loader.load("a")).toBe("https://cdn.donmai.us/1.jpg");
    s.values.delete(CHARACTER_IMAGE_CACHE_KEY);
    expect(await loader.load("a")).toBe("https://cdn.donmai.us/2.jpg");
    expect(refreshes).toEqual([true, true]);
    s.values.delete(CHARACTER_IMAGE_CACHE_KEY);
    expect(await createCharacterImageLoader({
      ...s.options,
      fetchImage: async (tag, options) => {
        expect(options.refresh).toBe(true);
        return { tag, imageUrl, cached: false, cachedAt: 1_000 };
      },
    }).load("a")).toBe(imageUrl);
  });
  test("manual refresh bypasses persisted and memory caches and replaces both", async () => {
    const s = setup();
    let requests = 0;
    const options = {
      ...s.options,
      fetchImage: async (tag: string) => ({
        tag, cached: false, cachedAt: 1_000,
        imageUrl: `https://cdn.donmai.us/${++requests}.jpg`,
      }),
    };
    const loader = createCharacterImageLoader(options);
    await loader.load("a");
    expect(await loader.load("a", { refresh: true })).toBe("https://cdn.donmai.us/2.jpg");
    expect(await loader.load("a")).toBe("https://cdn.donmai.us/2.jpg");
    expect(await createCharacterImageLoader(options).load("a")).toBe("https://cdn.donmai.us/2.jpg");
    expect(requests).toBe(2);
  });
  test("uses the original upstream timestamp rather than extending a cached response", async () => {
    const s = setup();
    s.setTime(1_000 + CHARACTER_IMAGE_CACHE_TTL - 1);
    let requests = 0;
    const loader = createCharacterImageLoader({
      ...s.options,
      fetchImage: async (tag) => {
        requests++;
        return { tag, imageUrl, cached: true, cachedAt: 1_000 };
      },
    });
    await loader.load("a");
    expect(JSON.parse(s.values.get(CHARACTER_IMAGE_CACHE_KEY)!).entries[0].cachedAt).toBe(1_000);
    s.setTime(1_000 + CHARACTER_IMAGE_CACHE_TTL);
    await loader.load("a");
    expect(requests).toBe(2);
  });
  test("late ordinary requests cannot overwrite a refreshed cache or delete its pending request", async () => {
    const s = setup();
    const resolvers: Array<(data: unknown) => void> = [];
    const loader = createCharacterImageLoader({
      ...s.options,
      fetchImage: () => new Promise((resolve) => resolvers.push(resolve)),
    });
    const old = loader.load("a");
    const fresh = loader.load("a", { refresh: true });
    const duplicate = loader.load("a", { refresh: true });
    expect(resolvers).toHaveLength(2);
    resolvers[0]({ tag: "a", imageUrl, cached: false, cachedAt: 1_000 });
    await old;
    const normal = loader.load("a");
    expect(resolvers).toHaveLength(2);
    const updated = "https://cdn.donmai.us/new.jpg";
    resolvers[1]({ tag: "a", imageUrl: updated, cached: false, cachedAt: 1_000 });
    expect(await Promise.all([fresh, duplicate, normal])).toEqual([updated, updated, updated]);
    expect(await loader.load("a")).toBe(updated);
  });
  test("failed manual refresh retains a previously successful cache for subsequent reads", async () => {
    const s = setup();
    let calls = 0;
    const loader = createCharacterImageLoader({
      ...s.options,
      fetchImage: async (tag) => {
        if (++calls > 1) throw new Error("Unavailable");
        return { tag, imageUrl, cached: false, cachedAt: 1_000 };
      },
    });
    await loader.load("a");
    await expect(loader.load("a", { refresh: true })).rejects.toThrow("Unavailable");
    expect(await loader.load("a")).toBe(imageUrl);
    expect(calls).toBe(2);
  });
  test("a storage write failure never replaces a refreshed memory URL with an older persisted URL", async () => {
    const s = setup();
    let calls = 0;
    let denied = false;
    const loader = createCharacterImageLoader({
      ...s.options,
      storage: () => ({
        ...s.options.storage(),
        setItem: (key, value) => {
          if (denied) throw new Error("Quota exceeded");
          s.options.storage().setItem(key, value);
        },
      }),
      fetchImage: async (tag) => ({
        tag, cached: false, cachedAt: 1_000,
        imageUrl: `https://cdn.donmai.us/${++calls}.jpg`,
      }),
    });
    await loader.load("a");
    denied = true;
    expect(await loader.load("a", { refresh: true })).toBe("https://cdn.donmai.us/2.jpg");
    expect(await loader.load("a")).toBe("https://cdn.donmai.us/2.jpg");
    expect(calls).toBe(2);
  });
});
