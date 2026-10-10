"use client";

import { useEffect, useState } from "react";
import { isAdultCodexCatalog, type AdultCodexCatalog } from "./adult-codex";

let memory: AdultCodexCatalog | null = null;
let pending: Promise<AdultCodexCatalog> | null = null;

async function fetchAdultCodex() {
  const response = await fetch("/api/adult-codex", { cache: "no-store" });
  const value: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      typeof value === "object" && value !== null && "error" in value && typeof value.error === "string"
        ? value.error : "成人法典加载失败，请稍后重试。",
    );
  }
  if (!isAdultCodexCatalog(value)) throw new Error("成人法典数据结构不正确。");
  memory = value;
  return value;
}

function loadAdultCodex() {
  if (memory) return Promise.resolve(memory);
  if (!pending) pending = fetchAdultCodex().finally(() => { pending = null; });
  return pending;
}

export function useAdultCodex() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    data: AdultCodexCatalog | null;
    loading: boolean;
    error: string | null;
  }>({ data: memory, loading: !memory, error: null });

  useEffect(() => {
    let active = true;
    loadAdultCodex().then((data) => {
      if (active) setState({ data, loading: false, error: null });
    }).catch((error: unknown) => {
      if (active) setState({
        data: null, loading: false,
        error: error instanceof Error ? error.message : "无法连接成人法典 API。",
      });
    });
    return () => { active = false; };
  }, [attempt]);

  return {
    ...state,
    retry() {
      memory = null;
      setState({ data: null, loading: true, error: null });
      setAttempt((current) => current + 1);
    },
  };
}
