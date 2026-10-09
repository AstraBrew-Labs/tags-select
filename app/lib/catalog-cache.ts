import type { CatalogResponse } from "./catalog-types";

export const CATALOG_CACHE_KEY = "novelai-tags:catalog:v1";
export const CATALOG_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const CACHE_VERSION = 1;

export type CatalogStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;
type CacheEntry = {
  version: typeof CACHE_VERSION;
  cachedAt: number;
  expiresAt: number;
  data: CatalogResponse;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isOptionalText(value: unknown) {
  return value === null || typeof value === "string";
}
const categoryIds = new Set([
  "quality",
  "characters",
  "scene",
  "environment",
  "composition",
  "artStyle",
  "background",
  "expression",
  "face",
  "body",
  "clothing",
  "accessories",
  "characterDesign",
  "action",
  "illustrator",
  "r18",
]);

/** Validate API and cached data before the UI creates lookup maps from it. */
export function isCatalogResponse(value: unknown): value is CatalogResponse {
  if (
    !isRecord(value) ||
    !Array.isArray(value.categories) ||
    !Array.isArray(value.groups) ||
    !Array.isArray(value.tags)
  )
    return false;
  const categories = new Set<string>();
  for (const category of value.categories) {
    if (
      !isRecord(category) ||
      typeof category.id !== "string" ||
      !categoryIds.has(category.id) ||
      categories.has(category.id) ||
      typeof category.sourceKey !== "string" ||
      typeof category.nameZh !== "string" ||
      typeof category.nameEn !== "string" ||
      !isCount(category.count)
    )
      return false;
    categories.add(category.id);
  }
  const groups = new Map<string, string>();
  for (const group of value.groups) {
    if (
      !isRecord(group) ||
      typeof group.id !== "string" ||
      groups.has(group.id) ||
      typeof group.categoryId !== "string" ||
      !categories.has(group.categoryId) ||
      typeof group.nameZh !== "string" ||
      !isCount(group.count)
    )
      return false;
    groups.set(group.id, group.categoryId);
  }
  const tags = new Set<string>();
  for (const tag of value.tags) {
    if (
      !isRecord(tag) ||
      typeof tag.id !== "string" ||
      tags.has(tag.id) ||
      typeof tag.categoryId !== "string" ||
      !categories.has(tag.categoryId) ||
      typeof tag.groupId !== "string" ||
      groups.get(tag.groupId) !== tag.categoryId ||
      typeof tag.zh !== "string" ||
      typeof tag.en !== "string" ||
      !Array.isArray(tag.aliases) ||
      !tag.aliases.every((alias: unknown) => typeof alias === "string") ||
      !isOptionalText(tag.note) ||
      !isOptionalText(tag.imageUrl) ||
      typeof tag.popular !== "boolean"
    )
      return false;
    tags.add(tag.id);
  }
  const source = value.source;
  return (
    source === null ||
    (isRecord(source) &&
      typeof source.sourceFile === "string" &&
      typeof source.sourceUrl === "string" &&
      typeof source.importedAt === "string" &&
      isCount(source.tagCount) &&
      isCount(source.imageCount))
  );
}

function removeCache(storage: CatalogStorage | null) {
  try {
    storage?.removeItem(CATALOG_CACHE_KEY);
  } catch {
    /* Storage may be blocked. */
  }
}
function isFresh(entry: CacheEntry, now: number) {
  return Number.isFinite(now) && entry.cachedAt <= now && now < entry.expiresAt;
}

export function readCatalogCache(
  storage: CatalogStorage | null,
  now = Date.now(),
): CacheEntry | null {
  try {
    const raw = storage?.getItem(CATALOG_CACHE_KEY);
    if (!raw) return null;
    const entry: unknown = JSON.parse(raw);
    if (
      isRecord(entry) &&
      entry.version === CACHE_VERSION &&
      typeof entry.cachedAt === "number" &&
      Number.isFinite(entry.cachedAt) &&
      typeof entry.expiresAt === "number" &&
      entry.expiresAt === entry.cachedAt + CATALOG_CACHE_TTL &&
      isFresh(entry as CacheEntry, now) &&
      isCatalogResponse(entry.data)
    )
      return entry as CacheEntry;
    removeCache(storage);
  } catch {
    removeCache(storage);
  }
  return null;
}

/** Shared loader deduplicates mounts; persistence failures fall back to memory. */
export function createCatalogLoader({
  storage,
  fetchCatalog,
  now = Date.now,
}: {
  storage: () => CatalogStorage | null;
  fetchCatalog: () => Promise<unknown>;
  now?: () => number;
}) {
  let memory: CacheEntry | null = null;
  let pending: Promise<CatalogResponse> | null = null;
  let bypassStoredCache = false;
  function safeStorage() {
    try {
      return storage();
    } catch {
      return null;
    }
  }
  function invalidate() {
    memory = null;
    bypassStoredCache = true;
    removeCache(safeStorage());
  }
  function load(): Promise<CatalogResponse> {
    const currentTime = now();
    if (memory && isFresh(memory, currentTime))
      return Promise.resolve(memory.data);
    memory = bypassStoredCache
      ? null
      : readCatalogCache(safeStorage(), currentTime);
    if (memory) return Promise.resolve(memory.data);
    if (pending) return pending;
    pending = Promise.resolve()
      .then(fetchCatalog)
      .then((data) => {
        if (!isCatalogResponse(data))
          throw new Error("标签 API 返回的数据结构不正确。");
        const cachedAt = now();
        bypassStoredCache = false;
        memory = {
          version: CACHE_VERSION,
          cachedAt,
          expiresAt: cachedAt + CATALOG_CACHE_TTL,
          data,
        };
        try {
          safeStorage()?.setItem(CATALOG_CACHE_KEY, JSON.stringify(memory));
        } catch {
          /* Quota/storage failures must not discard successfully fetched data. */
        }
        return data;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }
  return { load, invalidate };
}

export function getCatalogStorage(): CatalogStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
