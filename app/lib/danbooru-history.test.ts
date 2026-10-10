import { describe, expect, test } from "bun:test";
import {
  createDanbooruHistoryStore,
  DANBOORU_HISTORY_KEY,
  DANBOORU_HISTORY_LIMIT,
} from "./danbooru-history";

const input = { query: "白色水手服", limit: 30, show_nsfw: false };
function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let time = 1000;
  const options = { storage: () => storage, now: () => time };
  return {
    store: createDanbooruHistoryStore(options),
    options,
    storage,
    values,
    setTime: (value: number) => { time = value; },
  };
}

describe("local Danbooru search history", () => {
  test("records cleaned weighted searches and can replay complete long tag lists", () => {
    const s = setup();
    s.store.record({ ...input, query: "{long hair}, -2::artist:mignon::" });
    expect(s.store.getSnapshot()[0].query).toBe("long hair, artist:mignon");
    s.setTime(2000);
    const query = Array.from({ length: 90 }, (_, index) => `{tag_${index}}`).join(", ");
    expect(s.store.record({ ...input, query })).toBe(true);
    const restored = createDanbooruHistoryStore(s.options).getSnapshot();
    expect(restored[0].query).toBe(Array.from({ length: 90 }, (_, index) => `tag_${index}`).join(", "));
    expect(restored).toHaveLength(2);
  });
  test("persists the query and search conditions, then restores them on reload", () => {
    const s = setup();
    expect(s.store.record({ ...input, query: ` ${input.query} ` })).toBe(true);
    const entries = createDanbooruHistoryStore(s.options).getSnapshot();
    expect(entries).toEqual([{ ...input, lastSearchedAt: 1000 }]);
    expect(JSON.parse(s.values.get(DANBOORU_HISTORY_KEY)!)).toEqual({
      version: 1,
      entries,
    });
  });
  test("repeated searches move to the front without duplicate rows", () => {
    const s = setup();
    s.store.record(input);
    s.setTime(2000);
    s.store.record({ ...input, query: "long hair" });
    s.setTime(3000);
    s.store.record(input);
    expect(s.store.getSnapshot().map((entry) => entry.query)).toEqual(["白色水手服", "long hair"]);
    expect(s.store.getSnapshot()[0].lastSearchedAt).toBe(3000);
  });
  test("adult and limit settings are separate replayable searches", () => {
    const s = setup();
    s.store.record(input);
    s.store.record({ ...input, show_nsfw: true });
    s.store.record({ ...input, limit: 5 });
    expect(s.store.getSnapshot()).toHaveLength(3);
    s.store.remove({ ...input, show_nsfw: true });
    expect(s.store.getSnapshot()).toHaveLength(2);
    expect(s.store.getSnapshot().some((entry) => entry.show_nsfw)).toBe(false);
  });
  test("keeps the most recent 30 entries in memory and storage", () => {
    const s = setup();
    for (let index = 0; index < 40; index++) {
      s.setTime(1000 + index);
      s.store.record({ ...input, query: `query-${index}` });
    }
    expect(s.store.getSnapshot()).toHaveLength(DANBOORU_HISTORY_LIMIT);
    expect(s.store.getSnapshot()[0].query).toBe("query-39");
    expect(s.store.getSnapshot().at(-1)?.query).toBe("query-10");
    expect(createDanbooruHistoryStore(s.options).getSnapshot()).toHaveLength(30);
  });
  test("history is independent of the one-day result cache TTL", () => {
    const s = setup();
    s.store.record(input);
    s.setTime(1000 + 60 * 24 * 60 * 60 * 1000);
    expect(createDanbooruHistoryStore(s.options).getSnapshot()).toHaveLength(1);
  });
  test("deleting or clearing history never changes other browser storage", () => {
    const s = setup();
    s.values.set("novelai-tags:danbooru-search:v2", "cached-results");
    s.values.set("favorites", "saved-tags");
    s.store.record(input);
    s.store.record({ ...input, query: "long hair" });
    s.store.remove(input);
    expect(createDanbooruHistoryStore(s.options).getSnapshot().map((entry) => entry.query)).toEqual(["long hair"]);
    s.store.clear();
    expect(createDanbooruHistoryStore(s.options).getSnapshot()).toEqual([]);
    expect(s.values.has(DANBOORU_HISTORY_KEY)).toBe(false);
    expect(s.values.get("novelai-tags:danbooru-search:v2")).toBe("cached-results");
    expect(s.values.get("favorites")).toBe("saved-tags");
  });
  test("corrupt, oversized and unsupported-version histories do not crash", () => {
    for (const raw of ["{broken", "x".repeat(64_001), '{"version":2,"entries":[]}', '{"version":1,"entries":{}}']) {
      const s = setup();
      s.values.set(DANBOORU_HISTORY_KEY, raw);
      expect(s.store.getSnapshot()).toEqual([]);
      expect(s.store.record(input)).toBe(true);
      expect(createDanbooruHistoryStore(s.options).getSnapshot()).toHaveLength(1);
    }
  });
  test("validates persisted records, strips extra fields, sorts and deduplicates", () => {
    const s = setup();
    s.setTime(4000);
    s.values.set(DANBOORU_HISTORY_KEY, JSON.stringify({
      version: 1,
      entries: [
        { ...input, lastSearchedAt: 1000 },
        { ...input, lastSearchedAt: 3000, unknown: "not retained" },
        { ...input, query: "", lastSearchedAt: 2000 },
        { ...input, query: "x".repeat(301), lastSearchedAt: 2000 },
        { ...input, show_nsfw: "true", lastSearchedAt: 2000 },
        { ...input, limit: 81, lastSearchedAt: 2000 },
        { ...input, lastSearchedAt: 5000 },
        { ...input, lastSearchedAt: -1 },
        null,
      ],
    }));
    expect(s.store.getSnapshot()).toEqual([{ ...input, lastSearchedAt: 3000 }]);
  });
  test("invalid searches are never saved", () => {
    const s = setup();
    expect(s.store.record({ ...input, query: "  " })).toBe(false);
    expect(s.store.record({ ...input, query: "x".repeat(301) })).toBe(false);
    expect(s.store.record({ ...input, limit: 0 })).toBe(false);
    expect(s.store.getSnapshot()).toEqual([]);
    expect(s.values.size).toBe(0);
  });
  test("denied storage preserves in-memory history and reports lack of persistence", () => {
    const store = createDanbooruHistoryStore({
      storage: () => { throw new Error("Denied"); },
      now: () => 1000,
    });
    expect(store.record(input)).toBe(false);
    store.refresh();
    expect(store.getSnapshot()).toEqual([{ ...input, lastSearchedAt: 1000 }]);
    expect(store.clear()).toBe(false);
    expect(store.getSnapshot()).toEqual([]);
  });
  test("write quota errors do not break recording or removing a search", () => {
    const s = setup();
    const store = createDanbooruHistoryStore({
      ...s.options,
      storage: () => ({ ...s.storage, setItem() { throw new Error("Quota"); } }),
    });
    expect(store.record(input)).toBe(false);
    expect(store.getSnapshot()).toHaveLength(1);
    store.remove(input);
    expect(store.getSnapshot()).toEqual([]);
  });
  test("external changes can refresh the stable snapshot and notify subscribers", () => {
    const s = setup();
    const before = s.store.getSnapshot();
    expect(s.store.getSnapshot()).toBe(before);
    let notifications = 0;
    const unsubscribe = s.store.subscribe(() => { notifications++; });
    createDanbooruHistoryStore(s.options).record(input);
    s.store.refresh();
    expect(s.store.getSnapshot()).toHaveLength(1);
    expect(notifications).toBe(1);
    s.store.refresh();
    expect(notifications).toBe(1);
    unsubscribe();
    s.store.clear();
    expect(notifications).toBe(1);
  });
  test("the server/hydration snapshot never exposes browser history or reads storage", () => {
    let reads = 0;
    const store = createDanbooruHistoryStore({
      storage: () => { reads++; return null; },
    });
    expect(store.getServerSnapshot()).toEqual([]);
    expect(store.getServerSnapshot()).toBe(store.getServerSnapshot());
    expect(reads).toBe(0);
    store.record(input);
    expect(store.getServerSnapshot()).toEqual([]);
  });
});
