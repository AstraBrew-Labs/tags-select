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
  fetchImage: (tag: string) => Promise<unknown>;
  now?: () => number;
}) {
  const memory = new Map<string, Entry>();
  const pending = new Map<string, Promise<string | null>>();
  const queue: Array<() => void> = [];
  let active = 0;

  function safeStorage() {
    try {
      return storage();
    } catch {
      return null;
    }
  }

  function readStored(): Entry[] {
    try {
      const value = JSON.parse(
        safeStorage()?.getItem(CHARACTER_IMAGE_CACHE_KEY) ?? "",
      );
      if (
        value?.version !== CHARACTER_IMAGE_CACHE_VERSION ||
        !Array.isArray(value.entries)
      )
        return [];
      return value.entries
        .slice(-CHARACTER_IMAGE_CACHE_MAX_ENTRIES)
        .filter(
          (entry: unknown): entry is Entry =>
            isFreshCharacterImage(entry, now()) &&
            typeof (entry as Entry).tag === "string",
        );
    } catch {
      return [];
    }
  }

  function remember(entry: Entry) {
    memory.set(entry.tag, entry);
    if (memory.size > CHARACTER_IMAGE_CACHE_MAX_ENTRIES)
      memory.delete(memory.keys().next().value!);
  }

  function store(entry: Entry) {
    remember(entry);
    try {
      const entries = readStored().filter((item) => item.tag !== entry.tag);
      entries.push(entry);
      safeStorage()?.setItem(
        CHARACTER_IMAGE_CACHE_KEY,
        JSON.stringify({
          version: CHARACTER_IMAGE_CACHE_VERSION,
          entries: entries.slice(-CHARACTER_IMAGE_CACHE_MAX_ENTRIES),
        }),
      );
    } catch {
      // Storage restrictions do not discard a successful in-memory result.
    }
  }

  function getCached(tag: string) {
    const remembered = memory.get(tag);
    if (isFreshCharacterImage(remembered, now())) return remembered.imageUrl;
    memory.delete(tag);
    const stored = readStored().find((entry) => entry.tag === tag);
    if (stored) {
      remember(stored);
      return stored.imageUrl;
    }
    return undefined;
  }

  async function fetchQueued(tag: string) {
    // Keep a scrolled page of tag cards from flooding the upstream API.
    if (active >= 3) await new Promise<void>((resolve) => queue.push(resolve));
    else active += 1;
    try {
      return await fetchImage(tag);
    } finally {
      const next = queue.shift();
      if (next) next();
      else active -= 1;
    }
  }

  async function load(rawTag: string): Promise<string | null> {
    const tag = resolveTagImageQuery(rawTag);
    if (!tag) return null;
    const cached = getCached(tag);
    if (cached !== undefined) return cached;
    const existing = pending.get(tag);
    if (existing) return existing;
    const promise = fetchQueued(tag)
      .then((data) => {
        if (!isCharacterImageResponse(data) || data.tag !== tag)
          throw new Error("标签例图返回的数据格式不正确。");
        store({ tag, cachedAt: now(), imageUrl: data.imageUrl });
        return data.imageUrl;
      })
      .finally(() => pending.delete(tag));
    pending.set(tag, promise);
    return promise;
  }

  return { load };
}

const characterImageLoader = createCharacterImageLoader({
  fetchImage: async (tag) => {
    const response = await fetch(
      `/api/danbooru/character-image?tag=${encodeURIComponent(tag)}`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!response.ok) throw new Error("标签例图暂时不可用。");
    return response.json();
  },
});

export const loadCharacterImage = characterImageLoader.load;
