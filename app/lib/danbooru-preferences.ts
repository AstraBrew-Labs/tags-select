import { getCatalogStorage, type CatalogStorage } from "./catalog-cache";
import type { DanbooruSearchInput } from "./danbooru-types";

export const DANBOORU_PREFERENCES_KEY = "novelai-tags:danbooru-preferences:v1";

export function requiresDanbooruAgeConfirmation(
  input: DanbooruSearchInput,
  adultEnabled: boolean,
) {
  return input.show_nsfw && !adultEnabled;
}

export function createDanbooruPreferencesStore({
  storage,
}: {
  storage: () => CatalogStorage | null;
}) {
  let initialized = false;
  let adultEnabled = false;
  const listeners = new Set<() => void>();

  function initialize() {
    if (initialized) return;
    initialized = true;
    try {
      const raw = storage()?.getItem(DANBOORU_PREFERENCES_KEY);
      if (!raw || raw.length > 2048) return;
      const stored: unknown = JSON.parse(raw);
      if (
        typeof stored === "object" &&
        stored !== null &&
        "version" in stored && stored.version === 1 &&
        "showNsfw" in stored && stored.showNsfw === true &&
        "adultConfirmed" in stored && stored.adultConfirmed === true
      ) adultEnabled = true;
    } catch {
      // Missing, denied or corrupted storage always starts in safe mode.
    }
  }

  function save(enabled: boolean) {
    initialize();
    const changed = adultEnabled !== enabled;
    adultEnabled = enabled;
    let persisted = false;
    try {
      const target = storage();
      if (target) {
        target.setItem(DANBOORU_PREFERENCES_KEY, JSON.stringify({
          version: 1,
          showNsfw: enabled,
          adultConfirmed: enabled,
        }));
        persisted = true;
      }
    } catch {
      // Keep the user's explicit choice for this page even if persistence fails.
      // Quota errors may still permit deleting the old opt-in record. Prefer the
      // safe default on the next visit over resurrecting a previously enabled flag.
      if (!enabled) {
        try {
          const target = storage();
          if (target) {
            target.removeItem(DANBOORU_PREFERENCES_KEY);
            persisted = true;
          }
        } catch {
          // Fully blocked storage can only keep this session's safe setting.
        }
      }
    }
    if (changed) for (const listener of listeners) listener();
    return persisted;
  }

  return {
    getSnapshot() {
      initialize();
      return adultEnabled;
    },
    // Never read localStorage during SSR or the first hydration render.
    getServerSnapshot: () => false,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    enableAfterAgeConfirmation: () => save(true),
    disable: () => save(false),
  };
}

export const danbooruPreferences = createDanbooruPreferencesStore({
  storage: getCatalogStorage,
});
