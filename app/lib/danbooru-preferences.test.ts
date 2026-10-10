import { describe, expect, test } from "bun:test";
import {
  createDanbooruPreferencesStore,
  DANBOORU_PREFERENCES_KEY,
  requiresDanbooruAgeConfirmation,
} from "./danbooru-preferences";

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  const options = { storage: () => storage };
  return { values, options, store: createDanbooruPreferencesStore(options) };
}

describe("adult tag preferences", () => {
  test("first visit defaults off without creating a record or inferring consent", () => {
    const { store, values } = setup();
    expect(store.getSnapshot()).toBe(false);
    expect(values.size).toBe(0);
  });

  test("explicit confirmation persists enabled and restores on a later visit", () => {
    const s = setup();
    expect(s.store.enableAfterAgeConfirmation()).toBe(true);
    expect(s.store.getSnapshot()).toBe(true);
    expect(JSON.parse(s.values.get(DANBOORU_PREFERENCES_KEY)!)).toEqual({
      version: 1, showNsfw: true, adultConfirmed: true,
    });
    expect(createDanbooruPreferencesStore(s.options).getSnapshot()).toBe(true);
  });

  test("closing or declining writes an off record and never restores the older on value", () => {
    const s = setup();
    s.store.enableAfterAgeConfirmation();
    expect(s.store.disable()).toBe(true);
    expect(JSON.parse(s.values.get(DANBOORU_PREFERENCES_KEY)!)).toEqual({
      version: 1, showNsfw: false, adultConfirmed: false,
    });
    expect(createDanbooruPreferencesStore(s.options).getSnapshot()).toBe(false);
    expect(s.store.disable()).toBe(true);
    expect(s.values.has(DANBOORU_PREFERENCES_KEY)).toBe(true);
  });

  test("malformed or unconfirmed data never enables adult content", () => {
    for (const raw of [
      "true", "null", "[]", "{}", "{broken",
      "x".repeat(2049),
      JSON.stringify({ version: 2, showNsfw: true, adultConfirmed: true }),
      JSON.stringify({ version: 1, showNsfw: true }),
      JSON.stringify({ version: 1, showNsfw: true, adultConfirmed: false }),
      JSON.stringify({ version: 1, showNsfw: "true", adultConfirmed: true }),
      JSON.stringify({ version: 1, showNsfw: true, adultConfirmed: "true" }),
      JSON.stringify({ version: 1, showNsfw: false, adultConfirmed: true }),
    ]) {
      const s = setup();
      s.values.set(DANBOORU_PREFERENCES_KEY, raw);
      expect(s.store.getSnapshot()).toBe(false);
    }
  });

  test("preference writes do not delete or change history, results or favorites", () => {
    const s = setup();
    for (const key of ["history", "danbooru-results", "favorites"])
      s.values.set(key, "preserved");
    s.store.enableAfterAgeConfirmation();
    s.store.disable();
    for (const key of ["history", "danbooru-results", "favorites"])
      expect(s.values.get(key)).toBe("preserved");
  });

  test("storage unavailable keeps explicit choices in memory and reports failed persistence", () => {
    for (const options of [
      { storage: () => null },
      { storage: () => { throw new Error("Denied"); } },
      { storage: () => ({
        getItem: () => { throw new Error("Denied"); },
        setItem: () => { throw new Error("Quota"); },
        removeItem: () => { throw new Error("Denied"); },
      }) },
    ]) {
      const store = createDanbooruPreferencesStore(options);
      expect(store.getSnapshot()).toBe(false);
      expect(store.enableAfterAgeConfirmation()).toBe(false);
      expect(store.getSnapshot()).toBe(true);
      expect(store.disable()).toBe(false);
      expect(store.getSnapshot()).toBe(false);
    }
  });

  test("failed write still updates memory; a new store restores the last successfully saved choice", () => {
    const s = setup();
    let allowWrites = true;
    const options = { storage: () => ({
      getItem: (key: string) => s.values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (!allowWrites) throw new Error("Quota");
        s.values.set(key, value);
      },
      removeItem: () => { throw new Error("Denied"); },
    }) };
    const store = createDanbooruPreferencesStore(options);
    expect(store.enableAfterAgeConfirmation()).toBe(true);
    allowWrites = false;
    expect(store.disable()).toBe(false);
    expect(store.getSnapshot()).toBe(false);
    expect(createDanbooruPreferencesStore(options).getSnapshot()).toBe(true);
  });

  test("quota failures when disabling remove the stale opt-in so the next visit defaults off", () => {
    const s = setup();
    s.values.set(DANBOORU_PREFERENCES_KEY, JSON.stringify({
      version: 1, showNsfw: true, adultConfirmed: true,
    }));
    s.values.set("history", "preserved");
    const store = createDanbooruPreferencesStore({
      storage: () => ({
        getItem: (key: string) => s.values.get(key) ?? null,
        setItem: () => { throw new Error("Quota"); },
        removeItem: (key: string) => { s.values.delete(key); },
      }),
    });
    expect(store.getSnapshot()).toBe(true);
    expect(store.disable()).toBe(true);
    expect(s.values.has(DANBOORU_PREFERENCES_KEY)).toBe(false);
    expect(s.values.get("history")).toBe("preserved");
    expect(createDanbooruPreferencesStore(s.options).getSnapshot()).toBe(false);
  });

  test("snapshots are stable and subscribers are only notified of changed state", () => {
    const s = setup();
    const changes: boolean[] = [];
    const unsubscribe = s.store.subscribe(() => changes.push(s.store.getSnapshot()));
    s.store.enableAfterAgeConfirmation();
    s.store.enableAfterAgeConfirmation();
    s.store.disable();
    expect(changes).toEqual([true, false]);
    unsubscribe();
    s.store.enableAfterAgeConfirmation();
    expect(changes).toEqual([true, false]);
    expect(s.store.getSnapshot()).toBe(s.store.getSnapshot());
  });

  test("SSR and first hydration remain off and never read browser storage", () => {
    let reads = 0;
    const store = createDanbooruPreferencesStore({
      storage: () => {
        reads += 1;
        return {
          getItem: () => JSON.stringify({ version: 1, showNsfw: true, adultConfirmed: true }),
          setItem: () => {},
          removeItem: () => {},
        };
      },
    });
    expect(store.getServerSnapshot()).toBe(false);
    expect(reads).toBe(0);
    expect(store.getSnapshot()).toBe(true);
    expect(reads).toBe(1);
    expect(store.getServerSnapshot()).toBe(false);
  });

  test("adult history and retries need confirmation when off, even if that search was previously adult", () => {
    const input = { query: "白色水手服", limit: 30, show_nsfw: true };
    expect(requiresDanbooruAgeConfirmation(input, false)).toBe(true);
    expect(requiresDanbooruAgeConfirmation(input, true)).toBe(false);
    expect(requiresDanbooruAgeConfirmation({ ...input, show_nsfw: false }, false)).toBe(false);
    expect(requiresDanbooruAgeConfirmation({ ...input, show_nsfw: false }, true)).toBe(false);
  });
});
