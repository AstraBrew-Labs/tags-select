"use client";

import { codexDataset } from "./datasets";
import { useDataset } from "./use-dataset";

export function useDirectorCodex() {
  return useDataset(codexDataset);
}
