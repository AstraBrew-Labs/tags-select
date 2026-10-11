import type { CatalogResponse } from "../app/lib/catalog-types";
import { normalizePromptTagName } from "../app/lib/prompt-weights";
import { preprocessPromptQuery } from "../app/lib/prompt-preprocessing";
import type { DanbooruSearchResponse } from "../app/lib/danbooru-types";

export const AI_SEARCH_LIMIT = 50;
export const AI_REMOTE_CACHE_TTL = 24 * 60 * 60_000;
export type AiSearchInput = {
  query: string;
  direction: "auto" | "tag-to-zh" | "zh-to-tag";
  source: "local" | "danbooru";
  limit: number;
  offset: number;
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
};
export type AiSearchResult = AiSearchInput & {
  total: number;
  has_more: boolean;
  results: AiTagResult[];
};
export class AiSearchError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function parseAiSearchInput(value: unknown): AiSearchInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiSearchError("请提供搜索参数。", 400);
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["query", "direction", "source", "limit", "offset"].includes(key))) {
    throw new AiSearchError("存在未知搜索参数。", 400);
  }
  if (typeof input.query !== "string" || !input.query.trim() || input.query.length > 300) {
    throw new AiSearchError("query 须为 1–300 个字符。", 400);
  }
  const query = preprocessPromptQuery(input.query).trim();
  if (!query || query.length > 300) throw new AiSearchError("请输入有效标签或中文关键词。", 400);
  const direction = input.direction ?? "auto";
  const source = input.source ?? "local";
  const limit = input.limit ?? 20;
  const offset = input.offset ?? 0;
  if (typeof direction !== "string" || !["auto", "tag-to-zh", "zh-to-tag"].includes(direction) ||
      typeof source !== "string" || !["local", "danbooru"].includes(source) ||
      typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > AI_SEARCH_LIMIT ||
      typeof offset !== "number" || !Number.isInteger(offset) || offset < 0 || offset > 10_000) {
    throw new AiSearchError("direction/source 无效，limit 须为 1–50，offset 须为 0–10000 的整数。", 400);
  }
  if (source === "danbooru" && offset !== 0) {
    throw new AiSearchError("Danbooru 搜索不支持分页，offset 必须为 0。", 400);
  }
  return { query, direction: direction as AiSearchInput["direction"], source: source as AiSearchInput["source"], limit, offset };
}

const normalize = (value: string) => value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");

export function createAiTagIndex(catalog: CatalogResponse) {
  const categories = new Map(catalog.categories.map((item) => [item.id, item.nameZh]));
  const groups = new Map(catalog.groups.map((item) => [item.id, item.nameZh]));
  const rows = catalog.tags.filter((tag) => tag.categoryId !== "r18").map((tag) => ({
    result: {
      id: tag.id, tag: normalizePromptTagName(tag.en), zh: tag.zh,
      aliases: tag.aliases, category: tag.categoryId,
      category_name: categories.get(tag.categoryId) ?? tag.categoryId,
      group: groups.get(tag.groupId) ?? "", note: tag.note,
    },
    en: normalize(tag.en), zh: normalize(tag.zh), aliases: tag.aliases.map(normalize),
  }));
  return (input: AiSearchInput): AiSearchResult => {
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
      ...input, total: matches.length, has_more: input.offset + input.limit < matches.length,
      results: matches.slice(input.offset, input.offset + input.limit).map((item) => item.result),
    };
  };
}

export function createAiTagSearch({
  loadIndex, remoteSearch, now = Date.now,
}: {
  loadIndex: () => Promise<ReturnType<typeof createAiTagIndex>>;
  remoteSearch: (query: string, limit: number, signal: AbortSignal) => Promise<DanbooruSearchResponse>;
  now?: () => number;
}) {
  const cache = new Map<string, { expiresAt: number; results: AiTagResult[] }>();
  const pending = new Map<string, Promise<AiTagResult[]>>();
  let windowStart = 0;
  let attempts = 0;
  return async (input: AiSearchInput, signal: AbortSignal): Promise<AiSearchResult> => {
    signal.throwIfAborted();
    if (input.source === "local") return (await loadIndex())(input);
    const key = JSON.stringify([input.query.toLowerCase(), input.limit]);
    const saved = cache.get(key);
    let results = saved && now() < saved.expiresAt ? saved.results : undefined;
    if (!results) {
      let job = pending.get(key);
      if (!job) {
        if (now() - windowStart >= 60_000) { windowStart = now(); attempts = 0; }
        if (attempts >= 20 || pending.size >= 2) {
          throw new AiSearchError("公共搜索繁忙，请稍后重试或使用本地搜索。", 429);
        }
        attempts++;
        // A disconnected caller must not cancel a shared request used by other agents.
        job = remoteSearch(input.query, input.limit, AbortSignal.timeout(25_000)).then((data) => {
          const rows: AiTagResult[] = data.results.slice(0, input.limit).map((item) => ({
            id: item.tag, tag: normalizePromptTagName(item.tag), zh: item.cn_name,
            aliases: item.alias_from ? [item.alias_from] : [],
            category: item.category, category_name: item.category, group: "",
            note: item.wiki || null, match: "semantic",
          }));
          if (cache.size >= 100) cache.delete(cache.keys().next().value!);
          cache.set(key, { results: rows, expiresAt: now() + AI_REMOTE_CACHE_TTL });
          return rows;
        }).finally(() => pending.delete(key));
        pending.set(key, job);
      }
      results = await job;
    }
    signal.throwIfAborted();
    return { ...input, total: results.length, has_more: false, results };
  };
}
