"use client";

import { useEffect, useRef, useState } from "react";
import { loadCharacterImage } from "./character-image-cache";
import { resolveTagImageQuery } from "./tag-image-query";

type ImageState = {
  tag: string;
  imageUrl: string | null;
  status: "loading" | "ready" | "missing" | "error";
};

export function useTagImage(rawTag: string, enabled: boolean) {
  const tag = resolveTagImageQuery(rawTag);
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ImageState | null>(null);

  useEffect(() => {
    if (!enabled || !tag) return;
    const host = hostRef.current;
    let cancelled = false;
    let started = false;
    const load = () => {
      if (cancelled || started) return;
      started = true;
      setState({ tag, imageUrl: null, status: "loading" });
      void loadCharacterImage(tag)
        .then((imageUrl) => {
          if (!cancelled)
            setState({ tag, imageUrl, status: imageUrl ? "ready" : "missing" });
        })
        .catch(() => {
          if (!cancelled) setState({ tag, imageUrl: null, status: "error" });
        });
    };
    if (!host || typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "360px 0px" },
    );
    observer.observe(host);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [enabled, tag]);

  const current = enabled && state?.tag === tag ? state : null;
  return {
    hostRef,
    imageUrl: current?.imageUrl ?? null,
    loading: enabled && !!tag && (current === null || current.status === "loading"),
    error: current?.status === "error",
  };
}
