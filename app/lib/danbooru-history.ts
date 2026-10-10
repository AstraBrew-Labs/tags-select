import { getCatalogStorage, type CatalogStorage } from "./catalog-cache";
import { parseDanbooruInput, type DanbooruSearchInput } from "./danbooru-types";
import { preparePromptSearch } from "./prompt-preprocessing";

export const DANBOORU_HISTORY_KEY = "novelai-tags:danbooru-history:v1";
export const DANBOORU_HISTORY_LIMIT = 30;
export type DanbooruHistoryEntry = DanbooruSearchInput & {
  lastSearchedAt: number;
};
const EMPTY_HISTORY: readonly DanbooruHistoryEntry[] = [];

function parseHistoryInput(input: DanbooruSearchInput): DanbooruSearchInput | null {
  try {
    const prepared = preparePromptSearch(input.query);
    // Validate ordinary API options and every batch without imposing the
    // upstream single-request length on a complete locally batched history.
    if (!prepared.queries.every((query) => parseDanbooruInput({ ...input, query }))) return null;
    return { query: prepared.query, limit: input.limit, show_nsfw: input.show_nsfw };
  } catch {
    return null;
  }
}

export function getDanbooruHistoryEntryKey(input: DanbooruSearchInput) {
  return JSON.stringify([input.query.trim(), input.limit, input.show_nsfw]);
}

export function createDanbooruHistoryStore({
  storage,
  now = Date.now,
}: {
  storage: () => CatalogStorage | null;
  now?: () => number;
}) {
  let initialized = false;
  let entries: readonly DanbooruHistoryEntry[] = EMPTY_HISTORY;
  const listeners = new Set<() => void>();

  function read(): readonly DanbooruHistoryEntry[] | null {
    try {
      const target = storage();
      if (!target) return null;
      const raw = target.getItem(DANBOORU_HISTORY_KEY);
      if (!raw) return EMPTY_HISTORY;
      if (raw.length > 384_000) return EMPTY_HISTORY;
      const stored: unknown = JSON.parse(raw);
      if (
        typeof stored !== "object" ||
        stored === null ||
        !("version" in stored) ||
        stored.version !== 1 ||
        !("entries" in stored) ||
        !Array.isArray(stored.entries)
      ) return EMPTY_HISTORY;
      const valid: DanbooruHistoryEntry[] = [];
      const time = now();
      for (const entry of stored.entries) {
        if (
          typeof entry !== "object" || entry === null ||
          typeof entry.query !== "string" ||
          typeof entry.limit !== "number" ||
          typeof entry.show_nsfw !== "boolean" ||
          !Number.isSafeInteger(entry.lastSearchedAt) ||
          entry.lastSearchedAt < 0 || entry.lastSearchedAt > time
        ) continue;
        const input = parseHistoryInput({
          query: entry.query,
          limit: entry.limit,
          show_nsfw: entry.show_nsfw,
        });
        if (input) valid.push({ ...input, lastSearchedAt: entry.lastSearchedAt });
      }
      valid.sort((a, b) => b.lastSearchedAt - a.lastSearchedAt);
      const seen = new Set<string>();
      return valid.filter((entry) => {
        const key = getDanbooruHistoryEntryKey(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, DANBOORU_HISTORY_LIMIT);
    } catch {
      // Reading denied storage must not erase this page's in-memory history.
      return null;
    }
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    entries = read() ?? EMPTY_HISTORY;
  }
  function emit() {
    for (const listener of listeners) listener();
  }
  function save(next: readonly DanbooruHistoryEntry[]) {
    entries = next;
    let persisted = false;
    try {
      const target = storage();
      if (target) {
        if (entries.length === 0) target.removeItem(DANBOORU_HISTORY_KEY);
        else target.setItem(
          DANBOORU_HISTORY_KEY,
          JSON.stringify({ version: 1, entries }),
        );
        persisted = true;
      }
    } catch {
      // Quota/private-mode failures only affect persistence, never the search.
    }
    emit();
    return persisted;
  }
  function refresh() {
    initialize();
    const next = read();
    if (next !== null && JSON.stringify(next) !== JSON.stringify(entries)) {
      entries = next;
      emit();
    }
  }
  function onStorage(event: StorageEvent) {
    if (event.key === DANBOORU_HISTORY_KEY || event.key === null) refresh();
  }

  return {
    getSnapshot() {
      initialize();
      return entries;
    },
    // SSR and the first hydration render use exactly the same empty snapshot.
    getServerSnapshot: () => EMPTY_HISTORY,
    subscribe(listener: () => void) {
      if (listeners.size === 0 && typeof window !== "undefined") {
        window.addEventListener("storage", onStorage);
        refresh();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && typeof window !== "undefined")
          window.removeEventListener("storage", onStorage);
      };
    },
    record(input: DanbooruSearchInput) {
      const normalized = parseHistoryInput(input);
      if (!normalized) return false;
      initialize();
      const key = getDanbooruHistoryEntryKey(normalized);
      return save([
        { ...normalized, lastSearchedAt: now() },
        ...entries.filter((entry) => getDanbooruHistoryEntryKey(entry) !== key),
      ].slice(0, DANBOORU_HISTORY_LIMIT));
    },
    remove(input: DanbooruSearchInput) {
      initialize();
      const key = getDanbooruHistoryEntryKey(input);
      return save(entries.filter((entry) => getDanbooruHistoryEntryKey(entry) !== key));
    },
    clear() {
      initialize();
      return save(EMPTY_HISTORY);
    },
    refresh,
  };
}

export const danbooruHistory = createDanbooruHistoryStore({
  storage: getCatalogStorage,
});
