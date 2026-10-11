import type { CatalogResponse } from "../app/lib/catalog-types";
import { normalizePromptTagName } from "../app/lib/prompt-weights";
import { preprocessPromptQuery } from "../app/lib/prompt-preprocessing";
import type { DanbooruImageSizes } from "../app/lib/character-image-types";
import {
  DANBOORU_RECOMMENDATION_TAG_LIMIT,
  type DanbooruArtistRecommendation,
  type DanbooruRecommendationData,
  type DanbooruRelatedRecommendation,
  type DanbooruSearchResponse,
} from "../app/lib/danbooru-types";
import { AI_TAG_IMAGE_DEFAULT } from "./ai-tag-images";

export const AI_SEARCH_LIMIT = 50;
export const AI_REMOTE_CACHE_TTL = 24 * 60 * 60_000;
export const AI_REMOTE_TIMEOUT_MS = 25_000;
export const AI_REMOTE_LIMIT_PER_MINUTE = 20;
export const AI_REMOTE_MAX_CONCURRENCY = 2;
/** Categories the Danbooru recommendation service accepts as a filter. */
export const AI_DANBOORU_CATEGORIES = ["General", "Artist", "Copyright", "Character", "Meta"] as const;
/**
 * The local dictionary uses its own taxonomy, so a local-only match gets a
 * usable "same category" bucket by mapping the few categories that have a
 * Danbooru equivalent; everything else is Danbooru's own catch-all.
 */
const LOCAL_SOURCE_CATEGORIES: Record<string, string> = {
  characters: "Character",
  Illustrator: "Artist",
};
const localDanbooruCategory = (category: string) =>
  LOCAL_SOURCE_CATEGORIES[category] ?? "General";

export type AiSearchSource = "all" | "local" | "danbooru";
export type AiSearchInput = {
  query: string;
  direction: "auto" | "tag-to-zh" | "zh-to-tag";
  source: AiSearchSource;
  limit: number;
  offset: number;
  images: number;
  recommend: boolean;
};
export type AiTagResult = {
  id: string;
  tag: string;
  zh: string;
  aliases: string[];
  category: string;
  category_name: string;
  group: string;
  note: string | null;
  match: "exact" | "alias" | "prefix" | "contains" | "semantic";
  /**
   * Where the row came from. `local+danbooru` means both indexes held the tag
   * and the local row was completed with Danbooru data.
   */
  source: "local" | "danbooru" | "local+danbooru";
  /** Fields the local row was missing and Danbooru supplied, e.g. ["note"]; empty otherwise. */
  filled_fields: string[];
  /** Inline official Danbooru example image sizes; null when none was attached. */
  images: DanbooruImageSizes | null;
};
export type AiTagPage = {
  total: number;
  has_more: boolean;
  results: AiTagResult[];
};
export type AiRecommendations = {
  /** Tags the recommendations were derived from, in match-quality order. */
  basedOn: string[];
  artists: DanbooruArtistRecommendation[];
  sameCategory: DanbooruRelatedRecommendation[];
  related: DanbooruRelatedRecommendation[];
};
/** Sources that were requested but could not answer; empty when all succeeded. */
export type AiUnavailable = "danbooru" | "recommendations";
export type AiSearchResult = AiSearchInput & {
  total: number;
  has_more: boolean;
  /** Rows each source contributed: `local` includes the merged rows, so local + danbooru = total. */
  counts: { local: number; danbooru: number; merged: number };
  unavailable: AiUnavailable[];
  results: AiTagResult[];
  recommendations: AiRecommendations | null;
};
export class AiSearchError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function parseAiSearchInput(value: unknown): AiSearchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiSearchError("请提供搜索参数。", 400);
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["query", "direction", "source", "limit", "offset", "images", "recommend"].includes(key))) {
    throw new AiSearchError("存在未知搜索参数。", 400);
  }
  if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 300) {
    throw new AiSearchError("query 须为 1–300 个字符。", 400);
  }
  const query = preprocessPromptQuery(input.query).trim();
  if (!query || query.length > 300) throw new AiSearchError("请输入有效标签或中文关键词。", 400);
  const direction = input.direction ?? "auto";
  const source = input.source ?? "all";
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;
  const images = input.images ?? AI_TAG_IMAGE_DEFAULT;
  const recommend = input.recommend ?? true;
  if (typeof direction !== "string" || !["auto", "tag-to-zh", "zh-to-tag"].includes(direction) ||
      typeof source !== "string" || !["all", "local", "danbooru"].includes(source) ||
      typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > AI_SEARCH_LIMIT ||
      typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 10_000 ||
      typeof images !== "number" || !Number.isInteger(images) || images < 0 || images > AI_SEARCH_LIMIT ||
      typeof recommend !== "boolean") {
    throw new AiSearchError("direction/source 无效，limit 须为 1–50，offset 须为 0–10000，images 须为 0–50 的整数，recommend 须为布尔值。", 400);
  }
  if (source === "danbooru" && offset !== 0) {
    throw new AiSearchError("Danbooru 搜索不支持分页，offset 必须为 0。", 400);
  }
  return {
    query,
    direction: direction as AiSearchInput["direction"],
    source: source as AiSearchInput["source"],
    limit, offset, images, recommend,
  };
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
/** Dedupe key shared by the local index and the merged remote rows. */
const mergeKey = (tag: string) => tag.trim().toLowerCase().replace(/_/g, " ");

export function createAiTagIndex(catalog: CatalogResponse) {
  const categories = new Map(catalog.categories.map((item) => [item.id, item.nameZh]));
  const groups = new Map(catalog.groups.map((item) => [item.id, item.nameZh]));
  const rows = catalog.tags.filter((tag) => tag.categoryId !== "r18").map((tag) => ({
    result: {
      id: tag.id, tag: normalizePromptTagName(tag.en), zh: tag.zh,
      aliases: tag.aliases, category: tag.categoryId,
      category_name: categories.get(tag.categoryId) ?? tag.categoryId,
      group: groups.get(tag.groupId) ?? "", note: tag.note,
      source: "local" as const, filled_fields: [], images: null,
    },
    en: normalize(tag.en), zh: normalize(tag.zh), aliases: tag.aliases.map(normalize),
  }));
  return (input: AiSearchInput): AiTagPage => {
    const query = normalize(input.query);
    const words = query.split(" ");
    const matches = rows.flatMap((row) => {
      const primary = input.direction === "tag-to-zh" ? [row.en] :
        input.direction === "zh-to-tag" ? [row.zh] : [row.en, row.zh];
      const fields = [...primary, ...row.aliases];
      let score: number;
      if (primary.includes(query)) score = 0;
      else if (row.aliases.includes(query)) score = 1;
      else if (fields.some((value) => value.startsWith(query))) score = 2;
      else if (words.every((word) => fields.some((value) => value.includes(word)))) score = 3;
      else return [];
      const match = (["exact", "alias", "prefix", "contains"] as const)[score];
      return [{ score, result: { ...row.result, match } }];
    }).sort((a, b) => a.score - b.score || a.result.tag.localeCompare(b.result.tag) || a.result.id.localeCompare(b.result.id));
    return {
      total: matches.length,
      has_more: input.offset + input.limit < matches.length,
      results: matches.slice(input.offset, input.offset + input.limit).map((item) => item.result),
    };
  };
}

/** A plausible single Danbooru tag for the recommendation upstream. */
function recommendationTag(tag: string) {
  const value = tag.trim().replace(/^artist:\s*/i, "").replace(/\s+/g, "_").toLowerCase();
  return value && value.length <= 100 && !/[,:*]/.test(value) && !/^[-~]/.test(value)
    ? value
    : null;
}

export function recommendationTags(results: readonly AiTagResult[], limit = DANBOORU_RECOMMENDATION_TAG_LIMIT) {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const result of results) {
    if (tags.length >= limit) break;
    const tag = recommendationTag(result.tag);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

/**
 * The local dictionary is the curated base (id, Chinese name, taxonomy, match
 * quality); Danbooru only fills what the local row lacks, so a tag with no
 * local note but a Danbooru wiki entry still carries that note.
 */
export function mergeDanbooruSupplement(base: AiTagResult, supplement: AiTagResult): AiTagResult {
  const note = base.note?.trim() ? base.note : supplement.note?.trim() ? supplement.note : null;
  const zh = base.zh.trim() ? base.zh : supplement.zh.trim();
  const aliases = [...new Set([...base.aliases, ...supplement.aliases])];
  const filled_fields: string[] = [];
  if (note && !base.note?.trim()) filled_fields.push("note");
  if (zh && !base.zh.trim()) filled_fields.push("zh");
  if (aliases.length > base.aliases.length) filled_fields.push("aliases");
  return { ...base, zh, note, aliases, source: "local+danbooru", filled_fields };
}

/**
 * Merges the two ranked pages: local rows keep their position (completed with
 * Danbooru data when the tag exists there), then the remaining Danbooru rows
 * are appended in their own relevance order.
 */
export function mergeSearchResults(local: readonly AiTagResult[], remote: readonly AiTagResult[]) {
  const remoteByKey = new Map<string, AiTagResult>();
  for (const row of remote) {
    const key = mergeKey(row.tag);
    if (!remoteByKey.has(key)) remoteByKey.set(key, row);
  }
  let merged = 0;
  const results = local.map((row) => {
    const supplement = remoteByKey.get(mergeKey(row.tag));
    if (!supplement) return row;
    merged += 1;
    return mergeDanbooruSupplement(row, supplement);
  });
  const localKeys = new Set(local.map((row) => mergeKey(row.tag)));
  const extra = remote.filter((row) => !localKeys.has(mergeKey(row.tag)));
  return {
    results: [...results, ...extra],
    counts: { local: local.length, danbooru: extra.length, merged },
  };
}

export function createAiTagSearch({
  loadIndex, remoteSearch, fetchRecommendations,
  enrichImages = async (results) => results.map((item) => item.images), now = Date.now,
}: {
  loadIndex: () => Promise<ReturnType<typeof createAiTagIndex>>;
  remoteSearch: (query: string, limit: number, signal: AbortSignal) => Promise<DanbooruSearchResponse>;
  /** Best-effort recommendations; null means the public pool could not answer. */
  fetchRecommendations?: (input: { tags: string[]; categories: string[] }, signal: AbortSignal) => Promise<DanbooruRecommendationData | null>;
  /** Best-effort inline example images for the leading merged results. */
  enrichImages?: (results: readonly AiTagResult[], count: number, signal: AbortSignal) => Promise<(DanbooruImageSizes | null)[]>;
  now?: () => number;
}) {
  const cache = new Map<string, { expiresAt: number; results: AiTagResult[] }>();
  const pending = new Map<string, Promise<AiTagResult[]>>();
  let windowStart = 0;
  let attempts = 0;

  async function searchRemote(query: string, limit: number): Promise<AiTagResult[]> {
    const key = JSON.stringify([query.toLowerCase(), limit]);
    const saved = cache.get(key);
    if (saved && now() < saved.expiresAt) return saved.results;
    let job = pending.get(key);
    if (!job) {
      if (now() - windowStart >= 60_000) { windowStart = now(); attempts = 0; }
      if (attempts >= AI_REMOTE_LIMIT_PER_MINUTE || pending.size >= AI_REMOTE_MAX_CONCURRENCY) {
        throw new AiSearchError("公共搜索繁忙，请稍后重试或使用本地搜索。", 429);
      }
      attempts++;
      // A disconnected caller must not cancel a shared request used by other agents.
      job = remoteSearch(query, limit, AbortSignal.timeout(AI_REMOTE_TIMEOUT_MS)).then((data) => {
        const rows: AiTagResult[] = data.results.slice(0, limit).map((item) => ({
          id: item.tag, tag: normalizePromptTagName(item.tag), zh: item.cn_name,
          aliases: item.alias_from ? [item.alias_from] : [],
          category: item.category, category_name: item.category, group: "",
          note: item.wiki || null, match: "semantic", source: "danbooru",
          filled_fields: [], images: null,
        }));
        if (cache.size >= 100) cache.delete(cache.keys().next().value!);
        cache.set(key, { results: rows, expiresAt: now() + AI_REMOTE_CACHE_TTL });
        return rows;
      }).finally(() => pending.delete(key));
      pending.set(key, job);
    }
    return job;
  }

  return async (input: AiSearchInput, signal: AbortSignal): Promise<AiSearchResult> => {
    signal.throwIfAborted();
    const unavailable: AiUnavailable[] = [];
    const localJob = input.source === "danbooru"
      ? Promise.resolve<AiTagPage | null>(null)
      : loadIndex().then((index) => index(input));
    const remoteJob: Promise<AiTagResult[] | null> = input.source === "local"
      ? Promise.resolve(null)
      : searchRemote(input.query, input.limit).catch((error) => {
        // An explicit Danbooru-only search must still report the failure, while
        // the combined mode keeps serving the local half instead of failing.
        if (input.source === "danbooru") throw error;
        unavailable.push("danbooru");
        return null;
      });
    const [localPage, remoteRows] = await Promise.all([localJob, remoteJob]);

    const local = localPage?.results ?? [];
    const remote = remoteRows ?? [];
    const { results: merged, counts } = mergeSearchResults(local, remote);

    const basedOn = recommendationTags(merged);
    // Real Danbooru categories win; a local-only match falls back to the mapped
    // local taxonomy so "same category" is still meaningful without a remote hit.
    const remoteCategories = [...new Set(remote.map((item) => item.category))]
      .filter((category) => (AI_DANBOORU_CATEGORIES as readonly string[]).includes(category));
    const categories = (remoteCategories.length
      ? remoteCategories
      : [...new Set(local.map((item) => localDanbooruCategory(item.category)))]
    ).slice(0, AI_DANBOORU_CATEGORIES.length);
    const recommendationJob = (async (): Promise<AiRecommendations | null> => {
      // null means no recommendation was performed: switched off, or a
      // deployment without the recommendation service wired in.
      if (!input.recommend || !fetchRecommendations) return null;
      if (basedOn.length === 0) {
        return { basedOn, artists: [], sameCategory: [], related: [] };
      }
      const data = await fetchRecommendations({ tags: basedOn, categories }, signal);
      if (!data) {
        unavailable.push("recommendations");
        return { basedOn, artists: [], sameCategory: [], related: [] };
      }
      return {
        basedOn, artists: data.artists,
        sameCategory: data.sameCategory, related: data.related,
      };
    })();

    const imageJob = (async () => {
      if (input.images <= 0 || merged.length === 0) return merged;
      const sizes = await enrichImages(merged, input.images, signal);
      return merged.map((result, index) => ({ ...result, images: sizes[index] ?? null }));
    })();

    const [results, recommendations] = await Promise.all([imageJob, recommendationJob]);
    signal.throwIfAborted();
    return {
      ...input,
      total: results.length,
      has_more: localPage?.has_more ?? false,
      counts,
      unavailable,
      results,
      recommendations,
    };
  };
}
