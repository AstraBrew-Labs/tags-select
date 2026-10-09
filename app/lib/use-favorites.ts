"use client";

import { useMemo, useSyncExternalStore } from "react";

const KEY = "novelai-tags:favorites:v1";
const EVENT = "novelai-tags:favorites-change";
let memorySnapshot = "[]";
let memoryOnly = false;
function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) callback();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, callback);
  };
}
function getSnapshot() {
  if (memoryOnly) return memorySnapshot;
  try {
    return localStorage.getItem(KEY) ?? "[]";
  } catch {
    return memorySnapshot;
  }
}
function getServerSnapshot() {
  return "[]";
}
export function useFavorites(
  normalizeTagIds: (ids: readonly string[]) => string[],
) {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const favorites = useMemo<string[]>(() => {
    try {
      const parsed: unknown = JSON.parse(snapshot);
      return Array.isArray(parsed)
        ? normalizeTagIds(
            parsed.filter((id): id is string => typeof id === "string"),
          )
        : [];
    } catch {
      return [];
    }
  }, [snapshot, normalizeTagIds]);
  function toggleFavorite(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((item) => item !== id)
      : [...favorites, id];
    memorySnapshot = JSON.stringify(next);
    try {
      localStorage.setItem(KEY, memorySnapshot);
    } catch {
      memoryOnly = true; /* Keep favorites usable in memory when browser storage is unavailable. */
    }
    window.dispatchEvent(new Event(EVENT));
  }
  return { favorites, toggleFavorite };
}
