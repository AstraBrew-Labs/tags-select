import type { DanbooruRecommendationData } from "../app/lib/danbooru-types";

export const AI_RECOMMENDATION_CACHE_TTL = 24 * 60 * 60_000;
export const AI_RECOMMENDATION_LIMIT_PER_MINUTE = 20;
export const AI_RECOMMENDATION_MAX_CONCURRENCY = 2;
/** Safety net covering the per-node timeouts plus an international fallback. */
export const AI_RECOMMENDATION_TIMEOUT_MS = 30_000;
const CACHE_MAX_ENTRIES = 100;

export type AiRecommendationQuery = { tags: string[]; categories: string[] };

/**
 * Server-side cache and public-pool budget for the AI recommendation lookups.
 * Mirrors the semantic search guard: one day of successful results, in-flight
 * dedupe and a hard per-instance concurrency/rate ceiling. Every failure mode
 * resolves to `null` so a search can never fail because recommendations did.
 */
export function createAiRecommendations({
  fetchRecommendations,
  now = Date.now,
}: {
  fetchRecommendations: (input: AiRecommendationQuery, signal: AbortSignal) => Promise<DanbooruRecommendationData>;
  now?: () => number;
}) {
  const cache = new Map<string, { expiresAt: number; data: DanbooruRecommendationData }>();
  const pending = new Map<string, Promise<DanbooruRecommendationData | null>>();
  let windowStart = 0;
  let attempts = 0;
  let active = 0;

  return async function loadRecommendations(
    input: AiRecommendationQuery,
  ): Promise<DanbooruRecommendationData | null> {
    if (input.tags.length === 0) return null;
    const key = JSON.stringify([[...input.tags].sort(), [...input.categories].sort()]);
    const saved = cache.get(key);
    if (saved && now() < saved.expiresAt) return saved.data;
    let job = pending.get(key);
    if (!job) {
      if (now() - windowStart >= 60_000) { windowStart = now(); attempts = 0; }
      if (attempts >= AI_RECOMMENDATION_LIMIT_PER_MINUTE || active >= AI_RECOMMENDATION_MAX_CONCURRENCY) {
        return null;
      }
      attempts += 1;
      active += 1;
      // A disconnected caller must not cancel a request other agents may reuse.
      job = fetchRecommendations(input, AbortSignal.timeout(AI_RECOMMENDATION_TIMEOUT_MS))
        .then((data) => {
          if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
          cache.set(key, { data, expiresAt: now() + AI_RECOMMENDATION_CACHE_TTL });
          return data;
        })
        .catch(() => null)
        .finally(() => {
          pending.delete(key);
          active -= 1;
        });
      pending.set(key, job);
    }
    return job;
  };
}
