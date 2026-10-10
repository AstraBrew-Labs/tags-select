"use client";

import { useEffect } from "react";
import { datasets } from "../lib/datasets";

export default function DatasetPrefetch() {
  useEffect(() => {
    datasets.forEach((loader) => { void loader.start(); });
    const refresh = () => {
      if (document.visibilityState === "visible") {
        datasets.forEach((loader) => { void loader.refresh(); });
      }
    };
    const timer = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
  }, []);
  return null;
}
