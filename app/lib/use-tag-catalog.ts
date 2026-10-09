"use client";
import { useEffect, useMemo, useState } from "react";
import type { CatalogResponse } from "./catalog-types";
import { createTagCatalog, emptyCatalog } from "./tag-catalog";
import { createCatalogLoader, getCatalogStorage } from "./catalog-cache";

const loader = createCatalogLoader({
  storage: getCatalogStorage,
  async fetchCatalog() {
    const response = await fetch("/api/catalog", { cache: "no-store" });
    const data: unknown = await response.json();
    if (!response.ok) {
      const message =
        typeof data === "object" &&
        data !== null &&
        "error" in data &&
        typeof data.error === "string"
          ? data.error
          : "标签加载失败。";
      throw new Error(message);
    }
    return data;
  },
});

export function useTagCatalog() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    data: CatalogResponse | null;
    loading: boolean;
    error: string | null;
  }>({ data: null, loading: true, error: null });
  useEffect(() => {
    let active = true;
    // A shared request survives effect cleanup (including Strict Mode replay),
    // but an unmounted consumer never receives a state update.
    loader
      .load()
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (active)
          setState({
            data: null,
            loading: false,
            error:
              error instanceof Error
                ? error.message
                : "无法连接标签 API，请稍后重试。",
          });
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const catalog = useMemo(
    () => (state.data ? createTagCatalog(state.data) : emptyCatalog),
    [state.data],
  );
  function retry() {
    loader.invalidate();
    setState({ data: null, loading: true, error: null });
    setAttempt((value) => value + 1);
  }
  return { catalog, loading: state.loading, error: state.error, retry };
}
