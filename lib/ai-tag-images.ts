import {
  resolveValidCharacterImageTag,
  type DanbooruImageSizes,
} from "../app/lib/character-image-types";

/** How many ranked results carry an example image unless the caller overrides it. */
export const AI_TAG_IMAGE_DEFAULT = 8;
export const AI_TAG_IMAGE_MAX_CONCURRENCY = 4;
export const AI_TAG_IMAGE_LIMIT_PER_MINUTE = 120;
const AI_TAG_IMAGE_TAG_MAX_LENGTH = 200;

/**
 * A search result tag is mostly already normalized, but it may still carry the
 * `artist:` qualifier the tag cards strip. Defer to the shared single-tag
 * validator so an image lookup can never inherit a compound or operator value.
 */
export function resolveAiImageTag(value: string): string | null {
  if (value.length > AI_TAG_IMAGE_TAG_MAX_LENGTH) return null;
  return resolveValidCharacterImageTag(
    value.trim().replace(/^artist:\s*/i, ""),
  );
}

export type AiTagImageEnricher = <T extends { tag: string }>(
  results: readonly T[],
  count: number,
  signal: AbortSignal,
) => Promise<(DanbooruImageSizes | null)[]>;

/**
 * Attaches at most `count` example images to the front of a ranked result page.
 * Images are a best-effort enrichment: a failed, blocked or rate-limited lookup
 * resolves to `null` so the text results are always returned unchanged.
 */
export function createAiTagImageEnricher({
  loadSizes,
  now = Date.now,
}: {
  loadSizes: (tag: string) => Promise<DanbooruImageSizes | null>;
  now?: () => number;
}): AiTagImageEnricher {
  let windowStart = 0;
  let used = 0;
  return async function enrichImages(results, count, signal) {
    const sizes: (DanbooruImageSizes | null)[] = results.map(() => null);
    if (count <= 0 || results.length === 0) return sizes;
    if (now() - windowStart >= 60_000) {
      windowStart = now();
      used = 0;
    }
    // The per-minute budget is shared across concurrent searches; overflow
    // results simply stay without an image instead of failing the search.
    const targets = Math.min(
      count,
      results.length,
      Math.max(0, AI_TAG_IMAGE_LIMIT_PER_MINUTE - used),
    );
    if (targets <= 0) return sizes;
    used += targets;
    let next = 0;
    const worker = async () => {
      while (true) {
        const index = next++;
        if (index >= targets || signal.aborted) return;
        const tag = resolveAiImageTag(results[index].tag);
        if (!tag) continue;
        try {
          sizes[index] = await loadSizes(tag);
        } catch {
          sizes[index] = null;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(AI_TAG_IMAGE_MAX_CONCURRENCY, targets) }, worker),
    );
    return sizes;
  };
}
