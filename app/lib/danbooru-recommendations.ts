import {
  DANBOORU_RECOMMENDATION_TAG_LIMIT,
  parseDanbooruRecommendationData,
  type DanbooruRecommendationData,
} from "./danbooru-types";
import {
  DANBOORU_CACHE_TTL,
} from "./danbooru-cache";
import { getCatalogStorage, type CatalogStorage } from "./catalog-cache";

export const DANBOORU_RECOMMENDATION_CACHE_KEY =
  "novelai-tags:danbooru-recommendations:v1";
const MAX_ENTRIES = 20;
export type DanbooruRecommendationInput = {
  tags: string[];
  categories: string[];
  show_nsfw: boolean;
};
type Entry = {
  key: string;
  cachedAt: number;
  data: DanbooruRecommendationData;
};
export type RecommendationResult = {
  data: DanbooruRecommendationData;
  cached: boolean;
};

function normalize(input: DanbooruRecommendationInput): DanbooruRecommendationInput {
  return {
    tags: [...new Set(input.tags.map((tag) => tag.trim()))].slice(
      0,
      DANBOORU_RECOMMENDATION_TAG_LIMIT,
    ),
    categories: [...new Set(input.categories)].sort(),
    show_nsfw: input.show_nsfw,
  };
}
function keyFor(input: DanbooruRecommendationInput) {
  return JSON.stringify(normalize(input));
}
function isFresh(entry: Entry, now: number) {
  return entry.cachedAt <= now && now < entry.cachedAt + DANBOORU_CACHE_TTL;
}
function readEntries(storage: CatalogStorage | null, now: number): Entry[] {
  try {
    const raw = storage?.getItem(DANBOORU_RECOMMENDATION_CACHE_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw);
    if (stored.version !== 1 || !Array.isArray(stored.entries))
      throw new Error("InvalidCache");
    return stored.entries
      .slice(-MAX_ENTRIES)
      .filter((item: unknown): item is Entry => {
        if (
          typeof item !== "object" ||
          item === null ||
          typeof (item as Entry).key !== "string" ||
          typeof (item as Entry).cachedAt !== "number" ||
          !isFresh(item as Entry, now)
        )
          return false;
        return Boolean(parseDanbooruRecommendationData((item as Entry).data));
      });
  } catch {
    try {
      storage?.removeItem(DANBOORU_RECOMMENDATION_CACHE_KEY);
    } catch {
      /* Storage can be unavailable without blocking recommendations. */
    }
    return [];
  }
}

export function createDanbooruRecommendationLoader({
  storage,
  fetchRecommendations,
  now = Date.now,
}: {
  storage: () => CatalogStorage | null;
  fetchRecommendations: (input: DanbooruRecommendationInput) => Promise<unknown>;
  now?: () => number;
}) {
  const memory = new Map<string, Entry>();
  const pending = new Map<string, Promise<RecommendationResult>>();
  function safeStorage() {
    try {
      return storage();
    } catch {
      return null;
    }
  }
  function store(entry: Entry) {
    memory.set(entry.key, entry);
    while (memory.size > MAX_ENTRIES)
      memory.delete(memory.keys().next().value!);
    try {
      const entries = readEntries(safeStorage(), now()).filter(
        (item) => item.key !== entry.key,
      );
      entries.push(entry);
      safeStorage()?.setItem(
        DANBOORU_RECOMMENDATION_CACHE_KEY,
        JSON.stringify({ version: 1, entries: entries.slice(-MAX_ENTRIES) }),
      );
    } catch {
      /* A successful request remains available from memory. */
    }
  }
  async function load(
    input: DanbooruRecommendationInput,
  ): Promise<RecommendationResult> {
    const normalized = normalize(input);
    const key = keyFor(normalized);
    const current = memory.get(key);
    const stored = current?.cachedAt
      ? current
      : readEntries(safeStorage(), now()).find((item) => item.key === key);
    if (stored && isFresh(stored, now())) {
      memory.set(key, stored);
      return { data: stored.data, cached: true };
    }
    memory.delete(key);
    const active = pending.get(key);
    if (active) return active;
    const promise = Promise.resolve()
      .then(() => fetchRecommendations(normalized))
      .then((response) => {
        const data = parseDanbooruRecommendationData(response);
        if (!data) throw new Error("推荐服务返回的数据格式不正确，请重试。");
        store({ key, cachedAt: now(), data });
        return { data, cached: false };
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  return { load };
}

export const danbooruRecommendationLoader =
  createDanbooruRecommendationLoader({
    storage: getCatalogStorage,
    fetchRecommendations: async (input) => {
      const response = await fetch("/api/danbooru/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
        signal: AbortSignal.timeout(35_000),
      });
      if (!response.ok) throw new Error("推荐服务暂时不可用。");
      return response.json();
    },
  });
