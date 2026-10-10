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
      return { tag, imageUrl, cached: false };
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
        return { tag, imageUrl: null, cached: false };
      },
    });
    await expect(loader.load("a")).rejects.toThrow("Unavailable");
    expect(await loader.load("a")).toBeNull();
    expect(await loader.load("a")).toBeNull();
    expect(requests).toBe(2);
  });
  test("invalid data and URLs are never persisted", async () => {
    for (const data of [
      { tag: "wrong", imageUrl, cached: false },
      { tag: "a", imageUrl: "https://other.example/a.jpg", cached: false },
      { tag: "a", imageUrl: "https://cdn.donmai.us/a.mp4", cached: false },
      { tag: "a", imageUrl: 7, cached: false },
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
        return { tag, imageUrl, cached: false };
      },
    });
    await Promise.all(Array.from({ length: 10 }, (_, i) => loader.load(`a_${i}`)));
    expect(maxActive).toBe(3);
    expect(active).toBe(0);
  });
});
