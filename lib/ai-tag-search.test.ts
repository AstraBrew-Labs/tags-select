import { describe, expect, test } from "bun:test";
import type { CatalogResponse } from "../app/lib/catalog-types";
import { danbooruFixture } from "../app/lib/danbooru-fixtures.test";
import type { DanbooruRecommendationData } from "../app/lib/danbooru-types";
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
const signal = () => new AbortController().signal;

describe("read-only AI tag lookup", () => {
  test("looks up Chinese and English, normalizes output names and preserves qualifiers", () => {
    expect(local("misaka_mikoto").results[0]).toMatchObject({
      tag: "misaka_mikoto", zh: "御坂美琴", category_name: "角色", group: "某科学", match: "exact", source: "local",
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
    expect(parseAiSearchInput({ query: "x" })).toMatchObject({
      source: "all", images: AI_TAG_IMAGE_DEFAULT, recommend: true, offset: 0, limit: 20,
    });
    for (const input of [
      null, {}, { query: "" }, { query: "{}" }, { query: "x".repeat(301) },
      { query: "x", limit: 0 }, { query: "x", limit: 51 }, { query: "x", limit: "2" },
      { query: "x", limit: 1.5 }, { query: "x", offset: -1 },
      { query: "x", images: -1 }, { query: "x", images: 51 }, { query: "x", images: 1.5 },
      { query: "x", images: "2" }, { query: "x", images: true },
      { query: "x", recommend: 1 }, { query: "x", recommend: "1" },
      { query: "x", source: "remote" }, { query: "x", source: "danbooru", offset: 1 },
      { query: "x", apiKey: "secret" },
      { query: "x", direction: ["auto"] }, { query: "x", source: ["local"] },
      { query: "x", url: "https://evil.test" }, { query: "x", show_nsfw: true },
    ]) expect(() => parseAiSearchInput(input)).toThrow();
  });
  test("completes matching local rows with Danbooru data instead of dropping them", async () => {
    const search = createAiTagSearch({
      loadIndex: async () => index,
      remoteSearch: async () => ({
        ...remoteData,
        results: [
          {
            ...remoteData.results[0], tag: "misaka_mikoto", category: "Character",
            cn_name: "御坂美琴", alias_from: "御坂", wiki: "御坂美琴的 wiki 说明",
          },
          { ...remoteData.results[0], tag: "white_serafuku", category: "General" },
        ],
      }),
    });
    const result = await search(parseAiSearchInput({ query: "misaka_mikoto", images: 0, recommend: false }), signal());
    // The local row keeps its position and identity; Danbooru only fills blanks.
    expect(result.results.map((item) => [item.tag, item.source])).toEqual([
      ["misaka_mikoto", "local+danbooru"], ["white_serafuku", "danbooru"],
    ]);
    expect(result.results[0]).toMatchObject({
      source: "local+danbooru", filled_fields: ["note", "aliases"],
      note: "御坂美琴的 wiki 说明", zh: "御坂美琴", aliases: ["炮姐", "御坂"],
      match: "exact", category: "characters", category_name: "角色", group: "某科学",
    });
    expect(result.results[1].filled_fields).toEqual([]);
    expect(result.counts).toEqual({ local: 1, danbooru: 1, merged: 1 });
    expect(result.total).toBe(2);
    expect(result.unavailable).toEqual([]);
  });
  test("keeps the local half when the combined Danbooru half fails", async () => {
    const search = createAiTagSearch({
      loadIndex: async () => index,
      remoteSearch: async () => { throw new Error("secret-upstream-error"); },
    });
    const combined = await search(parseAiSearchInput({ query: "misaka_mikoto", images: 0 }), signal());
    expect(combined.results.map((item) => item.tag)).toEqual(["misaka_mikoto"]);
    expect(combined.counts).toEqual({ local: 1, danbooru: 0, merged: 0 });
    expect(combined.unavailable).toEqual(["danbooru"]);
    // An explicit Danbooru-only request still reports the failure to the caller.
    await expect(search(parseAiSearchInput({ query: "x", source: "danbooru" }), signal()))
      .rejects.toThrow("secret-upstream-error");
  });
  test("source=local never calls remote search; external callers can use CORS", async () => {
    let calls = 0;
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => { calls++; return remoteData; },
    });
    const response = await handleAiTagSearch(new Request(
      "https://site.test/api/ai/tags?query=misaka_mikoto&source=local", { headers: { Origin: "https://agent.test" } },
    ), search);
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body.results[0].zh).toBe("御坂美琴");
    expect(body.counts).toEqual({ local: 1, danbooru: 0, merged: 0 });
    expect(calls).toBe(0);
  });
  test("HTTP query validation rejects duplicates, malformed numbers and unknown keys", async () => {
    let calls = 0;
    const search = async () => { calls++; return local("御坂") as never; };
    for (const query of [
      "query=x&query=y", "query=x&limit=1e2", "query=x&limit=", "query=x&url=https://evil.test",
      "query=x&offset=-1", "query=x&limit=1.5", "query=x&images=1e2", "query=x&images=-1",
      "query=x&images=1.5", "query=x&recommend=2", "query=x&recommend=true", "query=x&source=remote",
    ]) {
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
    const enriched = await search(parseAiSearchInput({ query: "御坂", source: "local", limit: 2, images: 1 }), signal());
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
    const plain = await off(parseAiSearchInput({ query: "御坂", source: "local", images: 0 }), signal());
    expect(calls).toBe(0);
    expect(plain.results.every((result) => result.images === null)).toBe(true);
  });
});

describe("merged recommendations", () => {
  const recommendationData: DanbooruRecommendationData = {
    artists: [{ artist: "artist_one", cooc_count: 5, post_count: 10, sources: ["x"], top_tags: ["y"] }],
    sameCategory: [{ tag: "same_tag", cn_name: "同类标签", category: "Character", sources: ["x"], wiki: "" }],
    related: [{ tag: "related_tag", cn_name: "相关标签", category: "General", sources: ["x"], wiki: "" }],
    nodes: { artists: "domestic", sameCategory: "domestic", related: "domestic" },
  };
  const characterRemote = {
    ...remoteData,
    results: [{ ...remoteData.results[0], tag: "white_serafuku", category: "Character" }],
  };
  test("bases recommendations on the merged tags and the Danbooru categories", async () => {
    const asked: Array<{ tags: string[]; categories: string[] }> = [];
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => characterRemote,
      fetchRecommendations: async (input) => { asked.push(input); return recommendationData; },
    });
    const result = await search(parseAiSearchInput({ query: "misaka_mikoto", images: 0 }), signal());
    expect(asked).toEqual([{ tags: ["misaka_mikoto", "white_serafuku"], categories: ["Character"] }]);
    expect(result.recommendations).toEqual({
      basedOn: ["misaka_mikoto", "white_serafuku"],
      artists: recommendationData.artists,
      sameCategory: recommendationData.sameCategory,
      related: recommendationData.related,
    });
    expect(result.unavailable).toEqual([]);
  });
  test("recommendations degrade to empty buckets without failing the search", async () => {
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => characterRemote,
      fetchRecommendations: async () => null,
    });
    const result = await search(parseAiSearchInput({ query: "misaka_mikoto", images: 0 }), signal());
    expect(result.recommendations).toEqual({
      basedOn: ["misaka_mikoto", "white_serafuku"], artists: [], sameCategory: [], related: [],
    });
    expect(result.unavailable).toEqual(["recommendations"]);
  });
  test("recommend=0 skips the recommendation service entirely", async () => {
    let calls = 0;
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => remoteData,
      fetchRecommendations: async () => { calls++; return recommendationData; },
    });
    const result = await search(parseAiSearchInput({ query: "misaka_mikoto", recommend: false }), signal());
    expect(result.recommendations).toBeNull();
    expect(calls).toBe(0);
  });
  test("local-only lookups still recommend from the merged tags using the mapped category", async () => {
    const asked: Array<{ tags: string[]; categories: string[] }> = [];
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => remoteData,
      fetchRecommendations: async (input) => { asked.push(input); return recommendationData; },
    });
    const result = await search(parseAiSearchInput({ query: "misaka_mikoto", source: "local", images: 0 }), signal());
    // characters maps onto Danbooru's Character so "same category" stays usable.
    expect(asked).toEqual([{ tags: ["misaka_mikoto"], categories: ["Character"] }]);
    expect(result.recommendations).toEqual({
      basedOn: ["misaka_mikoto"],
      artists: recommendationData.artists,
      sameCategory: recommendationData.sameCategory,
      related: recommendationData.related,
    });
    expect(result.counts).toEqual({ local: 1, danbooru: 0, merged: 0 });
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
    const input = parseAiSearchInput({ query: "白色水手服", source: "danbooru", images: 0 });
    const first = search(input, signal());
    const second = search(input, signal());
    complete();
    expect(await first).toEqual(await second);
    expect(calls).toBe(1);
    now += AI_REMOTE_CACHE_TTL - 1;
    await search(input, signal());
    expect(calls).toBe(1);
    now += 1;
    await search(input, signal());
    expect(calls).toBe(2);
  });
  test("errors are not cached and never leak the upstream message", async () => {
    let calls = 0;
    const search = createAiTagSearch({
      loadIndex: async () => index,
      remoteSearch: async () => { calls++; throw new Error("secret-upstream-error"); },
    });
    for (let i = 0; i < 2; i++) {
      const res = await handleAiTagSearch(new Request("https://site.test/api/ai/tags?query=x&source=danbooru"), search);
      expect(res.status).toBe(503);
      expect(await res.text()).not.toContain("secret-upstream-error");
    }
    expect(calls).toBe(2);
    // The combined mode reports the outage instead of failing the whole search.
    const combined = await handleAiTagSearch(new Request("https://site.test/api/ai/tags?query=x&images=0"), search);
    expect(combined.status).toBe(200);
    expect((await combined.json()).unavailable).toEqual(["danbooru"]);
    expect(calls).toBe(3);
  });
  test("limits remote concurrency and returns Retry-After", async () => {
    let complete!: () => void;
    const waiting = new Promise<void>((resolve) => { complete = resolve; });
    const search = createAiTagSearch({
      loadIndex: async () => index, remoteSearch: async () => { await waiting; return remoteData; },
    });
    const run = (query: string) => search(parseAiSearchInput({ query, source: "danbooru" }), signal());
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
    const run = (query: string) => search(parseAiSearchInput({ query, source: "danbooru", images: 0 }), signal());
    for (let i = 0; i < 20; i++) await run(String(i));
    expect((await run("0")).source).toBe("danbooru");
    await expect(run("new")).rejects.toThrow("公共搜索繁忙");
    now += 60_000;
    await run("new");
  });
});
