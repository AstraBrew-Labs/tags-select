"use client";

import { getCatalogStorage, type CatalogStorage } from "./catalog-cache";
import {
  CHARACTER_IMAGE_CACHE_KEY,
  CHARACTER_IMAGE_CACHE_MAX_ENTRIES,
  CHARACTER_IMAGE_CACHE_VERSION,
  isCharacterImageResponse,
  isFreshCharacterImage,
  type CharacterImageRecord,
} from "./character-image-types";
import { resolveTagImageQuery } from "./tag-image-query";

type Entry = CharacterImageRecord & { tag: string };

export function createCharacterImageLoader({
  storage = getCatalogStorage,
  fetchImage,
  now = Date.now,
}: {
  storage?: () => CatalogStorage | null;
  fetchImage: (tag: string, options: { refresh: boolean }) => Promise<unknown>;
  now?: () => number;
}) {
  const memory = new Map<string, Entry>();
  const persisted = new Set<string>();
  const pending = new Map<
    string,
    { refresh: boolean; promise: Promise<string | null> }
  >();
  const queue: Array<() => void> = [];
  let active = 0;

  function safeStorage() {
    try {
      return storage();
    } catch {
      return null;
    }
  }

  function readStored(): { entries: Entry[]; available: boolean } {
    const target = safeStorage();
    if (!target) return { entries: [], available: false };
    let raw: string | null;
    try {
      raw = target.getItem(CHARACTER_IMAGE_CACHE_KEY);
    } catch {
      return { entries: [], available: false };
    }
    try {
      const value = JSON.parse(raw ?? "");
      if (
        value?.version !== CHARACTER_IMAGE_CACHE_VERSION ||
        !Array.isArray(value.entries)
      )
        return { entries: [], available: true };
      const entries = value.entries
        .slice(-CHARACTER_IMAGE_CACHE_MAX_ENTRIES)
        .filter(
          (entry: unknown): entry is Entry =>
            isFreshCharacterImage(entry, now()) &&
            typeof (entry as Entry).tag === "string",
        );
      return { entries, available: true };
    } catch {
      return { entries: [], available: true };
    }
  }

  function remember(entry: Entry) {
    memory.set(entry.tag, entry);
    if (memory.size > CHARACTER_IMAGE_CACHE_MAX_ENTRIES) {
      const oldest = memory.keys().next().value!;
      memory.delete(oldest);
      persisted.delete(oldest);
    }
  }

  function store(entry: Entry) {
    persisted.delete(entry.tag);
    remember(entry);
    try {
      const entries = readStored().entries.filter((item) => item.tag !== entry.tag);
      entries.push(entry);
      const target = safeStorage();
      target?.setItem(
        CHARACTER_IMAGE_CACHE_KEY,
        JSON.stringify({
          version: CHARACTER_IMAGE_CACHE_VERSION,
          entries: entries.slice(-CHARACTER_IMAGE_CACHE_MAX_ENTRIES),
        }),
      );
      if (target) persisted.add(entry.tag);
    } catch {
      // Storage restrictions do not discard a successful in-memory result.
    }
  }

  function getCached(tag: string) {
    const remembered = memory.get(tag);
    const { entries, available } = readStored();
    if (
      (!available || !persisted.has(tag)) &&
      isFreshCharacterImage(remembered, now())
    )
      return remembered.imageUrl;
    const stored = entries.find((entry) => entry.tag === tag);
    if (stored) {
      remember(stored);
      persisted.add(tag);
      return stored.imageUrl;
    }
    // Clearing persistent storage also invalidates its in-memory counterpart.
    memory.delete(tag);
    persisted.delete(tag);
    return undefined;
  }

  async function fetchQueued(tag: string) {
    // Keep a scrolled page of tag cards from flooding the upstream API.
    if (active >= 3) await new Promise<void>((resolve) => queue.push(resolve));
    else active += 1;
    try {
      // A local miss (including a user-cleared cache) must reach the upstream,
      // not silently seed another week from a server-side cached URL.
      return await fetchImage(tag, { refresh: true });
    } finally {
      const next = queue.shift();
      if (next) next();
      else active -= 1;
    }
  }

  async function load(
    rawTag: string,
    { refresh = false }: { refresh?: boolean } = {},
  ): Promise<string | null> {
    const tag = resolveTagImageQuery(rawTag);
    if (!tag) return null;
    const existing = pending.get(tag);
    if (existing && (!refresh || existing.refresh)) return existing.promise;
    if (!refresh) {
      const cached = getCached(tag);
      if (cached !== undefined) return cached;
    }
    const promise = fetchQueued(tag)
      .then((data) => {
        if (!isCharacterImageResponse(data) || data.tag !== tag)
          throw new Error("标签例图返回的数据格式不正确。");
        if (pending.get(tag)?.promise === promise)
          store({ tag, cachedAt: data.cachedAt, imageUrl: data.imageUrl });
        return data.imageUrl;
      })
      .finally(() => {
        if (pending.get(tag)?.promise === promise) pending.delete(tag);
      });
    pending.set(tag, { refresh, promise });
    return promise;
  }

  return { load };
}

const characterImageLoader = createCharacterImageLoader({
  fetchImage: async (tag, { refresh }) => {
    const response = await fetch(
      `/api/danbooru/character-image?tag=${encodeURIComponent(tag)}${refresh ? "&refresh=1" : ""}`,
      { cache: "no-store", signal: AbortSignal.timeout(12_000) },
    );
    if (!response.ok) throw new Error("标签例图暂时不可用。");
    return response.json();
  },
});

export const loadCharacterImage = characterImageLoader.load;
