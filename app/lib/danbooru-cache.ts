import {
  DANBOORU_SERVICE_ERROR,
  DANBOORU_QUERY_MAX_LENGTH,
  applyDanbooruNsfwFilter,
  parseDanbooruResponse,
  type DanbooruSearchInput,
  type DanbooruSearchResponse,
} from "./danbooru-types";
import { getCatalogStorage, type CatalogStorage } from "./catalog-cache";
import { preparePromptSearch } from "./prompt-preprocessing";

// v2 invalidates v1 entries created before the server enforced show_nsfw.
export const DANBOORU_CACHE_KEY = "novelai-tags:danbooru-search:v2";
export const DANBOORU_CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 30;
type Entry = {
  key: string;
  cachedAt: number;
  data: DanbooruSearchResponse;
};
export type SearchResult = {
  data: DanbooruSearchResponse;
  cached: boolean;
};
function cacheKey(input: DanbooruSearchInput) {
  return JSON.stringify([input.query.trim(), input.limit, input.show_nsfw]);
}

/** Successful query+options results only; bounded cache, fixed one-day TTL. */
export function createDanbooruLoader({
  storage,
  fetchSearch,
  now = Date.now,
}: {
  storage: () => CatalogStorage | null;
  fetchSearch: (input: DanbooruSearchInput) => Promise<unknown>;
  now?: () => number;
}) {
  const memory = new Map<string, Entry>();
  const pending = new Map<string, Promise<SearchResult>>();
  function safeStorage() {
    try {
      return storage();
    } catch {
      return null;
    }
  }
  function fresh(entry: Entry) {
    const time = now();
    return entry.cachedAt <= time && time < entry.cachedAt + DANBOORU_CACHE_TTL;
  }
  function readStored(): Entry[] {
    try {
      const raw = safeStorage()?.getItem(DANBOORU_CACHE_KEY);
      if (!raw) return [];
      const stored = JSON.parse(raw);
      if (stored.version !== 1 || !Array.isArray(stored.entries))
        throw new Error("InvalidCache");
      const entries: Entry[] = [];
      for (const item of stored.entries.slice(-MAX_ENTRIES)) {
        const data = parseDanbooruResponse(item?.data);
        if (
          typeof item?.key === "string" &&
          Number.isFinite(item.cachedAt) &&
          data &&
          fresh(item)
        )
          entries.push({ key: item.key, cachedAt: item.cachedAt, data });
      }
      return entries;
    } catch {
      try {
        safeStorage()?.removeItem(DANBOORU_CACHE_KEY);
      } catch {
        // Restricted localStorage does not block search.
      }
      return [];
    }
  }
  function store(entry: Entry) {
    memory.set(entry.key, entry);
    if (memory.size > MAX_ENTRIES)
      memory.delete(memory.keys().next().value!);
    try {
      const entries = readStored().filter((item) => item.key !== entry.key);
      entries.push(entry);
      safeStorage()?.setItem(
        DANBOORU_CACHE_KEY,
        JSON.stringify({ version: 1, entries: entries.slice(-MAX_ENTRIES) }),
      );
    } catch {
      // Keep the successful result in memory if persistence fails.
    }
  }
  async function loadSingle(input: DanbooruSearchInput): Promise<SearchResult> {
    const key = cacheKey(input);
    const remembered = memory.get(key);
    const entry =
      remembered && fresh(remembered)
        ? remembered
        : readStored().find((item) => item.key === key);
    if (entry && fresh(entry)) {
      memory.set(key, entry);
      return { data: entry.data, cached: true };
    }
    memory.delete(key);
    const inFlight = pending.get(key);
    if (inFlight) return inFlight;
    const promise = Promise.resolve()
      .then(() => fetchSearch({ ...input, query: input.query.trim() }))
      .then((response) => {
        const data = parseDanbooruResponse(response);
        if (!data) throw new Error("搜索服务返回的数据格式不正确，请重试。");
        store({ key, cachedAt: now(), data });
        return { data, cached: false };
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  async function load(input: DanbooruSearchInput): Promise<SearchResult> {
    const { queries } = preparePromptSearch(input.query, DANBOORU_QUERY_MAX_LENGTH);
    if (queries.length === 1) return loadSingle({ ...input, query: queries[0] });
    const batches: SearchResult[] = [];
    // At most two requests concurrently; every batch retains domestic-first
    // fallback, safety options and its own one-day cache.
    let cursor = 0;
    let failed = false;
    await Promise.all(Array.from({ length: 2 }, async () => {
      while (!failed && cursor < queries.length) {
        const index = cursor++;
        try {
          batches[index] = await loadSingle({ ...input, query: queries[index] });
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }));
    const unique = new Map<string, DanbooruSearchResponse["results"][number]>();
    for (const batch of batches) {
      for (const tag of applyDanbooruNsfwFilter(batch.data, input.show_nsfw).results) {
        const previous = unique.get(tag.tag);
        if (!previous || tag.final_score > previous.final_score) unique.set(tag.tag, tag);
      }
    }
    const results = [...unique.values()]
      .sort((a, b) => b.final_score - a.final_score)
      .slice(0, input.limit);
    return {
      cached: batches.every((batch) => batch.cached),
      data: {
        results,
        tags_all: results.map((tag) => tag.tag).join(", "),
        tags_sfw: applyDanbooruNsfwFilter({
          results, tags_all: "", tags_sfw: "", keywords: [],
        }, false).results.map((tag) => tag.tag).join(", "),
        keywords: [...new Set(batches.flatMap((batch) => batch.data.keywords))],
        node: batches.some((batch) => batch.data.node === "international")
          ? "international" : "domestic",
      },
    };
  }
  return { load };
}

export const danbooruLoader = createDanbooruLoader({
  storage: getCatalogStorage,
  fetchSearch: async (input) => {
    try {
      const response = await fetch("/api/danbooru/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(28_000),
      });
      if (!response.ok) throw new Error(DANBOORU_SERVICE_ERROR);
      return await response.json();
    } catch {
      throw new Error(DANBOORU_SERVICE_ERROR);
    }
  },
});
