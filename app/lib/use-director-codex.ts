"use client";

import { useEffect, useState } from "react";
import { codexLoader } from "./codex-cache";
import type { CodexCatalog } from "./director-codex";

export function useDirectorCodex() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    data: CodexCatalog | null; loading: boolean; error: string | null;
  }>({ data: null, loading: true, error: null });
  useEffect(() => {
    let active = true;
    codexLoader.load().then((data) => {
      if (active) setState({ data, loading: false, error: null });
    }).catch((error: unknown) => {
      if (active) setState({
        data: null, loading: false,
        error: error instanceof Error ? error.message : "无法连接法典 API。",
      });
    });
    return () => { active = false; };
  }, [attempt]);
  return {
    ...state,
    retry() {
      codexLoader.invalidate();
      setState({ data: null, loading: true, error: null });
      setAttempt((current) => current + 1);
    },
  };
}
