"use client";

import { adultDataset } from "./datasets";
import { useDataset } from "./use-dataset";

export function useAdultCodex() {
  return useDataset(adultDataset);
}
