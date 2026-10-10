"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createDatasetLoader } from "./dataset-loader";

export function useDataset<T>(loader: ReturnType<typeof createDatasetLoader<T>>) {
  const state = useSyncExternalStore(loader.subscribe, loader.getSnapshot, loader.getServerSnapshot);
  useEffect(() => { void loader.start(); }, [loader]);
  return { ...state, retry: loader.retry };
}
