import { describe, expect, test } from "bun:test";
import { danbooruFixture } from "./danbooru-fixtures.test";
import {
  createDanbooruLoader,
  DANBOORU_CACHE_KEY,
  DANBOORU_CACHE_TTL,
} from "./danbooru-cache";

const input = { query: "白色水手服", limit: 30, show_nsfw: false };
function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let time = 1_000;
  let calls = 0;
  const options = {
    storage: () => storage,
    now: () => time,
    fetchSearch: async () => {
      calls++;
      return danbooruFixture;
    },
  };
  return {
    loader: createDanbooruLoader(options),
    options,
    values,
    calls: () => calls,
    setTime: (next: number) => { time = next; },
  };
}
describe("one-day Danbooru search cache", () => {
  test("uses a one-day TTL", () => {
    expect(DANBOORU_CACHE_TTL).toBe(24 * 60 * 60 * 1000);
  });

  test("next read and new loader read persisted cache, without network", async () => {
    const s = setup();
    expect((await s.loader.load(input)).cached).toBe(false);
    expect((await s.loader.load(input)).cached).toBe(true);
    expect((await createDanbooruLoader(s.options).load(input)).cached).toBe(true);
    expect(s.calls()).toBe(1);
    expect(s.values.has(DANBOORU_CACHE_KEY)).toBe(true);
  });
  test("expires exactly one day from successful retrieval, not last read", async () => {
    const s = setup();
    await s.loader.load(input);
    s.setTime(1_000 + DANBOORU_CACHE_TTL - 1);
    expect((await s.loader.load(input)).cached).toBe(true);
    s.setTime(1_000 + DANBOORU_CACHE_TTL);
    expect((await s.loader.load(input)).cached).toBe(false);
    expect(s.calls()).toBe(2);
  });
  test("query, limit and adult setting have separate cache entries", async () => {
    const s = setup();
    await s.loader.load(input);
    await s.loader.load({ ...input, query: ` ${input.query} ` });
    expect(s.calls()).toBe(1);
    await s.loader.load({ ...input, query: "long hair" });
    await s.loader.load({ ...input, limit: 5 });
    await s.loader.load({ ...input, show_nsfw: true });
    expect(s.calls()).toBe(4);
  });
  test("corruption and invalid schema are discarded", async () => {
    const s = setup();
    s.values.set(DANBOORU_CACHE_KEY, "{broken");
    expect((await s.loader.load(input)).cached).toBe(false);
    const loader = createDanbooruLoader({
      ...s.options,
      fetchSearch: async () => ({ results: [{}] }),
    });
    await expect(loader.load({ ...input, query: "not stored" })).rejects.toThrow(
      "格式",
    );
  });
  test("failed requests aren't cached, so retry reaches the service", async () => {
    const s = setup();
    let calls = 0;
    const loader = createDanbooruLoader({
      ...s.options,
      fetchSearch: async () => {
        calls++;
        if (calls === 1) throw new Error("Unavailable");
        return danbooruFixture;
      },
    });
    await expect(loader.load(input)).rejects.toThrow();
    expect(s.values.has(DANBOORU_CACHE_KEY)).toBe(false);
    expect((await loader.load(input)).cached).toBe(false);
    expect(calls).toBe(2);
  });
  test("concurrent identical requests are deduplicated", async () => {
    const s = setup();
    await Promise.all([s.loader.load(input), s.loader.load(input)]);
    expect(s.calls()).toBe(1);
  });
  test("storage denial falls back to memory", async () => {
    const s = setup();
    const loader = createDanbooruLoader({
      ...s.options,
      storage: () => { throw new Error("Denied"); },
    });
    await loader.load(input);
    expect((await loader.load(input)).cached).toBe(true);
    expect(s.calls()).toBe(1);
  });
  test("cache is bounded to 30 successful searches", async () => {
    const s = setup();
    for (let i = 0; i < 35; i++)
      await s.loader.load({ ...input, query: `query-${i}` });
    const stored = JSON.parse(s.values.get(DANBOORU_CACHE_KEY)!);
    expect(stored.entries).toHaveLength(30);
    expect(stored.entries[0].key).toContain("query-5");
  });
});
