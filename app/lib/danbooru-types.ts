export const DANBOORU_QUERY_MAX_LENGTH = 300;
export const DANBOORU_DEFAULT_LIMIT = 30;
export const DANBOORU_MAX_LIMIT = 80;
export const DANBOORU_RECOMMENDATION_TAG_LIMIT = 8;
export const DANBOORU_SERVICE_ERROR =
  "搜索服务暂时超时或不可用，请稍后重试。";

export type DanbooruSearchInput = {
  query: string;
  limit: number;
  show_nsfw: boolean;
};
export type DanbooruTag = {
  tag: string;
  cn_name: string;
  category: string;
  nsfw: string;
  final_score: number;
  semantic_score: number;
  count: number;
  source: string;
  layer: string;
  wiki: string;
  artist_top_tags: string[];
  alias_from: string | null;
};
export type DanbooruSearchData = {
  tags_all: string;
  tags_sfw: string;
  results: DanbooruTag[];
  keywords: string[];
};
export type DanbooruSearchResponse = DanbooruSearchData & {
  node: "domestic" | "international";
};
export type DanbooruArtistRecommendation = {
  artist: string;
  cooc_count: number;
  post_count: number;
  sources: string[];
  top_tags: string[];
};
export type DanbooruRelatedRecommendation = {
  tag: string;
  cn_name: string;
  category: string;
  sources: string[];
  wiki: string;
};
export type DanbooruRecommendationData = {
  artists: DanbooruArtistRecommendation[];
  sameCategory: DanbooruRelatedRecommendation[];
  related: DanbooruRelatedRecommendation[];
  nodes: {
    artists: "domestic" | "international";
    sameCategory: "domestic" | "international";
    related: "domestic" | "international";
  };
};

/** Danbooru currently returns "0"/"1", but keep the UI safe if the service
 * changes the string representation to a boolean-like value. */
export function isDanbooruNsfw(value: string): boolean {
  return !["0", "false", "safe", "sfw"].includes(value.trim().toLowerCase());
}

/**
 * The upstream service may keep adult rows in `results` even when
 * `show_nsfw=false`; `tags_sfw` is its filtered copy. Enforce the setting at
 * the server boundary so the browser and its cache can never display or copy
 * an adult result while the switch is off.
 */
export function applyDanbooruNsfwFilter(
  data: DanbooruSearchData,
  showNsfw: boolean,
): DanbooruSearchData {
  if (showNsfw) return data;
  const results = data.results.filter((tag) => !isDanbooruNsfw(tag.nsfw));
  return {
    ...data,
    tags_all:
      data.tags_sfw.trim() || results.map((tag) => tag.tag).join(", "),
    tags_sfw: results.map((tag) => tag.tag).join(", "),
    results,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Only expose fields in SearchOut/TagOut, never upstream notices or errors. */
export function parseDanbooruData(value: unknown): DanbooruSearchData | null {
  if (
    !isRecord(value) ||
    typeof value.tags_all !== "string" ||
    typeof value.tags_sfw !== "string" ||
    !isStrings(value.keywords) ||
    !Array.isArray(value.results) ||
    value.results.length > 500
  )
    return null;
  const results: DanbooruTag[] = [];
  for (const item of value.results) {
    if (
      !isRecord(item) ||
      typeof item.tag !== "string" ||
      !item.tag.trim() ||
      typeof item.cn_name !== "string" ||
      typeof item.category !== "string" ||
      typeof item.nsfw !== "string" ||
      !isFiniteNumber(item.final_score) ||
      !isFiniteNumber(item.semantic_score) ||
      typeof item.count !== "number" ||
      !Number.isSafeInteger(item.count) ||
      item.count < 0 ||
      typeof item.source !== "string" ||
      typeof item.layer !== "string" ||
      (item.wiki !== undefined && typeof item.wiki !== "string") ||
      (item.artist_top_tags !== undefined && !isStrings(item.artist_top_tags)) ||
      (item.alias_from !== undefined &&
        item.alias_from !== null &&
        typeof item.alias_from !== "string")
    )
      return null;
    results.push({
      tag: item.tag,
      cn_name: item.cn_name,
      category: item.category,
      nsfw: item.nsfw,
      final_score: item.final_score,
      semantic_score: item.semantic_score,
      count: item.count,
      source: item.source,
      layer: item.layer,
      wiki: (item.wiki as string | undefined) ?? "",
      artist_top_tags: (item.artist_top_tags as string[] | undefined) ?? [],
      alias_from: (item.alias_from as string | null | undefined) ?? null,
    });
  }
  return {
    tags_all: value.tags_all,
    tags_sfw: value.tags_sfw,
    results,
    keywords: value.keywords,
  };
}

export function parseDanbooruResponse(
  value: unknown,
): DanbooruSearchResponse | null {
  if (
    !isRecord(value) ||
    (value.node !== "domestic" && value.node !== "international")
  )
    return null;
  const data = parseDanbooruData(value);
  return data ? { ...data, node: value.node } : null;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function parseDanbooruArtists(
  value: unknown,
): DanbooruArtistRecommendation[] | null {
  if (!isRecord(value) || !Array.isArray(value.results) || value.results.length > 100)
    return null;
  const results: DanbooruArtistRecommendation[] = [];
  for (const item of value.results) {
    // Skip malformed rows instead of voiding the whole bucket: one bad entry in
    // a 24-row list must not hide the other 23 recommendations.
    if (
      !isRecord(item) ||
      typeof item.artist !== "string" ||
      !item.artist.trim() ||
      !isSafeInteger(item.cooc_count) ||
      !isSafeInteger(item.post_count) ||
      !isStrings(item.sources) ||
      !isStrings(item.top_tags)
    )
      continue;
    results.push({
      artist: item.artist,
      cooc_count: item.cooc_count,
      post_count: item.post_count,
      sources: item.sources,
      top_tags: item.top_tags,
    });
  }
  return results;
}

export function parseDanbooruRelated(
  value: unknown,
): DanbooruRelatedRecommendation[] | null {
  if (!isRecord(value) || !Array.isArray(value.results) || value.results.length > 300)
    return null;
  const results: DanbooruRelatedRecommendation[] = [];
  for (const item of value.results) {
    if (
      !isRecord(item) ||
      typeof item.tag !== "string" ||
      !item.tag.trim() ||
      typeof item.cn_name !== "string" ||
      typeof item.category !== "string" ||
      !isStrings(item.sources) ||
      (item.wiki !== undefined && typeof item.wiki !== "string")
    )
      continue;
    results.push({
      tag: item.tag,
      cn_name: item.cn_name,
      category: item.category,
      sources: item.sources,
      wiki: (item.wiki as string | undefined) ?? "",
    });
  }
  return results;
}

export function parseDanbooruRecommendationData(
  value: unknown,
): DanbooruRecommendationData | null {
  if (!isRecord(value) || !isRecord(value.nodes)) return null;
  const artists = parseDanbooruArtists({ results: value.artists });
  const sameCategory = parseDanbooruRelated({ results: value.sameCategory });
  const related = parseDanbooruRelated({ results: value.related });
  if (
    !artists ||
    !sameCategory ||
    !related ||
    !["domestic", "international"].includes(value.nodes.artists as string) ||
    !["domestic", "international"].includes(value.nodes.sameCategory as string) ||
    !["domestic", "international"].includes(value.nodes.related as string)
  )
    return null;
  return {
    artists,
    sameCategory,
    related,
    nodes: {
      artists: value.nodes.artists as "domestic" | "international",
      sameCategory: value.nodes.sameCategory as "domestic" | "international",
      related: value.nodes.related as "domestic" | "international",
    },
  };
}

export function parseDanbooruInput(
  value: unknown,
): DanbooruSearchInput | null {
  if (!isRecord(value) || typeof value.query !== "string") return null;
  const query = value.query.trim();
  const limit = value.limit ?? DANBOORU_DEFAULT_LIMIT;
  const showNsfw = value.show_nsfw ?? false;
  if (
    !query ||
    query.length > DANBOORU_QUERY_MAX_LENGTH ||
    typeof limit !== "number" ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > DANBOORU_MAX_LIMIT ||
    typeof showNsfw !== "boolean" ||
    Object.keys(value).some(
      (key) => !["query", "limit", "show_nsfw"].includes(key),
    )
  )
    return null;
  return { query, limit, show_nsfw: showNsfw };
}
