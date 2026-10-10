"use client";
import { useMemo } from "react";
import { createTagCatalog, emptyCatalog } from "./tag-catalog";
import { tagDataset } from "./datasets";
import { useDataset } from "./use-dataset";

export function useTagCatalog() {
  const { data, ...state } = useDataset(tagDataset);
  const catalog = useMemo(
    () => (data ? createTagCatalog(data) : emptyCatalog),
    [data],
  );
  return { catalog, ...state };
}
