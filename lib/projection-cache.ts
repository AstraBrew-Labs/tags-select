export const PROJECTION_TTL = 5 * 60_000;
export const PROJECTION_RETRY_DELAY = 30_000;
export type Projection = { gzip: Uint8Array; source: "database" | "local" };

export function createProjectionCache({
  readDatabase, readLocal, now = Date.now, waitMillis = 1_200,
}: {
  readDatabase: () => Promise<Uint8Array>;
  readLocal: () => Promise<Uint8Array>;
  now?: () => number;
  waitMillis?: number;
}) {
  let current: Projection | null = null;
  let expiresAt = 0;
  let pending: Promise<void> | null = null;
  let local: Promise<Uint8Array> | null = null;
  let nextAttempt = 0;
  function refresh() {
    if (pending || now() < nextAttempt || (current?.source === "database" && now() < expiresAt)) return;
    nextAttempt = now() + PROJECTION_RETRY_DELAY;
    pending = Promise.resolve().then(readDatabase).then((gzip) => {
      current = { gzip, source: "database" };
      expiresAt = now() + PROJECTION_TTL;
    }).catch(() => {
      // Retain the last good projection during database failures.
    }).finally(() => { pending = null; });
  }
  return {
    async read(): Promise<{ projection: Projection; background: Promise<void> | null }> {
      refresh();
      if (!current) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          if (pending) await Promise.race([
            pending,
            new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMillis); }),
          ]);
        } finally { clearTimeout(timer); }
        if (!current) {
          local ??= Promise.resolve().then(readLocal).catch((error) => { local = null; throw error; });
          const gzip = await local;
          // Preserve a database response that arrived while loading the fallback.
          current ??= { gzip, source: "local" };
        }
      }
      return { projection: current, background: pending };
    },
  };
}
