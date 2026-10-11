import { describe, expect, test } from "bun:test";
import type { CatalogResponse } from "../app/lib/catalog-types";
import { danbooruFixture } from "../app/lib/danbooru-fixtures.test";
import { handleAiTagSearch } from "./ai-http";
import { AI_TAG_IMAGE_DEFAULT } from "./ai-tag-images";
import {
  AI_REMOTE_CACHE_TTL, createAiTagIndex, createAiTagSearch, parseAiSearchInput,
} from "./ai-tag-search";

const catalog: CatalogResponse = {
  categories: [
    { id: "characters", sourceKey: "characters", nameZh: "角色", nameEn: "Characters", count: 3 },
    { id: "r18", sourceKey: "r18", nameZh: "成人", nameEn: "Adult", count: 1 },
  ],
  groups: [
    { id: "toaru", categoryId: "characters", nameZh: "某科学", count: 3 },
    { id: "adult", categoryId: "r18", nameZh: "成人", count: 1 },
  ],
  tags: [
    { id: "misaka", categoryId: "characters", groupId: "toaru", en: "misaka mikoto", zh: "御坂美琴", aliases: ["炮姐"], note: null, imageUrl: null, popular: true },
    { id: "sister", categoryId: "characters", groupId: "toaru", en: "misaka_imouto", zh: "御坂妹妹", aliases: [], note: "参考数据", imageUrl: null, popular: false },
    { id: "index", categoryId: "characters", groupId: "toaru", en: "index_(toaru_majutsu_no_index)", zh: "茵蒂克丝", aliases: [], note: null, imageUrl: null, popular: false },
    { id: "hidden", categoryId: "r18", groupId: "adult", en: "hidden_tag", zh: "不可用测试词", aliases: [], note: null, imageUrl: null, popular: false },
  ],
  source: null,
};
const index = createAiTagIndex(catalog);
const local = (query: string, options: Record<string, unknown> = {}) => index(parseAiSearchInput({ query, ...options }));
const remoteData = { ...danbooruFixture, node: "domestic" as const };

describe("read-only AI tag lookup", () => {
  test("looks up Chinese and English, normalizes output names and preserves qualifiers", () => {
    expect(local("misaka_mikoto").results[0]).toMatchObject({
      tag: "misaka_mikoto", zh: "御坂美琴", category_name: "角色", group: "某科学", match: "exact",
    });
    expect(local("{misaka mikoto}", { direction: "tag-to-zh" }).results[0].zh).toBe("御坂美琴");
    expect(local("御坂美琴", { direction: "zh-to-tag" }).results[0].tag).toBe("misaka_mikoto");
    expect(local("炮姐").results[0].match).toBe("alias");
    expect(local("index_(toaru_majutsu_no_index)").results[0].tag).toBe("index_(toaru_majutsu_no_index)");
  });
  test("keeps lookup direction, pagination, ranking and missing results honest", () => {
    expect(local("御坂", { limit: 1 })).toMatchObject({ total: 2, has_more: true });
    expect(local("御坂", { limit: 1, offset: 1 }).results).toHaveLength(1);
    expect(local("御坂", { direction: "tag-to-zh" }).results).toEqual([]);
    expect(local("no-such-tag").results).toEqual([]);
    expect(local("hidden_tag").results).toEqual([]);
  });
  test("strictly bounds input and rejects unexpected remote controls", () => {
    expect(parseAiSearchInput({ query: "x" }).images).toBe(AI_TAG_IMAGE_DEFAULT);
    for (const input of [
      null, {}, { query: "" }, { query: "{}" }, { query: "x".repeat(301) },
      { query: "x", limit: 0 }, { query: "x", limit: 51 }, { query: "x", limit: "2" },
      { query: "x", limit: 1.5 }, { query: "x", offset: -1 },
      { query: "x", images: -1 }, { query: "x", images: 51 }, { query: "x", images: 1.5 },
      { query: "x", images: "2" }, { query: "x", images: true },
      { query: "x", source: "danbooru", offset: 1 }, { query: "x", apiKey: "secret" },
      { query: "x", direction: ["auto"] }, { query: "x", source: ["local"] },
      { query: "x", url: "https://evil.test" }, { query: "x", show_nsfw: true },
    ]) expect(() => parseAiSearchInput(input)).toThrow();
  });
  test("local API never calls remote search; external callers can use CORS", async () => {
    let calls = 0;
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => { calls++; return remoteData; },
    });
    const response = await handleAiTagSearch(new Request(
      "https://site.test/api/ai/tags?query=misaka_mikoto", { headers: { Origin: "https://agent.test" } },
    ), search);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect((await response.json()).results[0].zh).toBe("御坂美琴");
    expect(calls).toBe(0);
  });
  test("HTTP query validation rejects duplicates, malformed numbers and unknown keys", async () => {
    let calls = 0;
    const search = async () => { calls++; return local("御坂"); };
    for (const query of ["query=x&query=y", "query=x&limit=1e2", "query=x&limit=", "query=x&url=https://evil.test", "query=x&offset=-1", "query=x&limit=1.5", "query=x&images=1e2", "query=x&images=-1", "query=x&images=1.5"]) {
      const response = await handleAiTagSearch(new Request(`https://site.test/api/ai/tags?${query}`), search);
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(calls).toBe(0);
  });
  test("inlines example images for the leading results and honours images=0", async () => {
    const asked: string[] = [];
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => remoteData,
      enrichImages: async (results, count) => results.map((result, position) => {
        if (position >= count) return null;
        asked.push(result.tag);
        return {
          preview: `https://cdn.donmai.us/180x180/${position}.jpg`,
          sample: `https://cdn.donmai.us/sample/${position}.jpg`,
          original: null,
        };
      }),
    });
    const enriched = await search(parseAiSearchInput({ query: "御坂", limit: 2, images: 1 }), new AbortController().signal);
    expect(enriched.images).toBe(1);
    expect(enriched.results[0].images).toMatchObject({
      preview: "https://cdn.donmai.us/180x180/0.jpg", sample: "https://cdn.donmai.us/sample/0.jpg", original: null,
    });
    expect(enriched.results[1].images).toBeNull();
    expect(asked).toEqual([enriched.results[0].tag]);

    let calls = 0;
    const off = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => remoteData,
      enrichImages: async (results) => { calls++; return results.map(() => null); },
    });
    const plain = await off(parseAiSearchInput({ query: "御坂", images: 0 }), new AbortController().signal);
    expect(calls).toBe(0);
    expect(plain.results.every((result) => result.images === null)).toBe(true);
  });
});

describe("AI public semantic quota protection", () => {
  test("deduplicates in-flight queries and caches successes for one day", async () => {
    let calls = 0;
    let now = 100_000;
    let complete!: () => void;
    const waiting = new Promise<void>((resolve) => { complete = resolve; });
    const search = createAiTagSearch({
      loadIndex: async () => index, now: () => now,
      remoteSearch: async () => { calls++; await waiting; return remoteData; },
    });
    const input = parseAiSearchInput({ query: "白色水手服", source: "danbooru" });
    const first = search(input, new AbortController().signal);
    const second = search(input, new AbortController().signal);
    complete();
    expect(await first).toEqual(await second);
    expect(calls).toBe(1);
    now += AI_REMOTE_CACHE_TTL - 1;
    await search(input, new AbortController().signal);
    expect(calls).toBe(1);
    now += 1;
    await search(input, new AbortController().signal);
    expect(calls).toBe(2);
  });
  test("errors are not cached and never make an automatic local-to-remote fallback", async () => {
    let calls = 0;
    const search = createAiTagSearch({
      loadIndex: async () => index,
      remoteSearch: async () => { calls++; throw new Error("secret-upstream-error"); },
    });
    expect((await search(parseAiSearchInput({ query: "not-found" }), new AbortController().signal)).results).toEqual([]);
    expect(calls).toBe(0);
    for (let i = 0; i < 2; i++) {
      const res = await handleAiTagSearch(new Request("https://site.test/api/ai/tags?query=x&source=danbooru"), search);
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("secret-upstream-error");
    }
    expect(calls).toBe(2);
  });
  test("limits remote concurrency and returns Retry-After", async () => {
    let complete!: () => void;
    const waiting = new Promise<void>((resolve) => { complete = resolve; });
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => { await waiting; return remoteData; },
    });
    const run = (query: string) => search(parseAiSearchInput({ query, source: "danbooru" }), new AbortController().signal);
    const one = run("one");
    const two = run("two");
    const response = await handleAiTagSearch(new Request("https://site.test/api/ai/tags?query=three&source=danbooru"), search);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("60");
    complete();
    await Promise.all([one, two]);
  });
  test("limits uncached requests per minute but does not throttle cached results", async () => {
    let now = 100_000;
    const search = createAiTagSearch({
      loadIndex: async () => index, now: () => now, remoteSearch: async () => remoteData,
    });
    const run = (query: string) => search(parseAiSearchInput({ query, source: "danbooru" }), new AbortController().signal);
    for (let i = 0; i < 20; i++) await run(String(i));
    expect((await run("0")).source).toBe("danbooru");
    await expect(run("new")).rejects.toThrow("公共搜索繁忙");
    now += 60_000;
    await run("new");
  });
});
