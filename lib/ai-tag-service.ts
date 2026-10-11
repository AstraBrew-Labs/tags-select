import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { isCatalogResponse } from "../app/lib/catalog-cache";
import { createAiTagIndex, createAiTagSearch } from "./ai-tag-search";
import { createAiTagImageEnricher } from "./ai-tag-images";
import { createAiRecommendations } from "./ai-tag-recommendations";
import { characterImageService } from "./danbooru-character-image-service";
import { fetchDanbooruRecommendations } from "./danbooru-recommendation-service";
import { searchDanbooru } from "./danbooru-search-service";

let index: Promise<ReturnType<typeof createAiTagIndex>> | undefined;
function loadIndex() {
  index ??= readFile(join(process.cwd(), "public/data/catalog.json.gz")).then((bytes) => {
    const catalog: unknown = JSON.parse(gunzipSync(bytes).toString("utf8"));
    if (!isCatalogResponse(catalog)) throw new Error("InvalidCatalog");
    return createAiTagIndex(catalog);
  }).catch((error) => { index = undefined; throw error; });
  return index;
}

// The example images reuse the tag-card pipeline, so they cost no extra private
// quota: general-rating posts only, blocked characters filtered, one weekly
// server-side cache and the same optional outbound proxy.
const enrichImages = createAiTagImageEnricher({
  loadSizes: (tag) => characterImageService.loadSizes(tag).then((result) => result.sizes),
});

// Recommendations go through the same anonymous public pool as the semantic
// search: no API key, no site registration headers, never a private fallback.
// `partial` keeps whichever bucket answered, so one slow or rejected sub-request
// cannot blank artists, same-category and related all at once. The tighter
// per-node timeouts bound the worst case for an interactive AI request; the
// same-site page keeps its own, longer budget.
const recommendations = createAiRecommendations({
  fetchRecommendations: (input, signal) => fetchDanbooruRecommendations(
    { ...input, show_nsfw: false }, signal,
    { quota: "public", partial: true, timeouts: [10_000, 15_000] },
  ),
});

// Deliberately never read DANBOORU_SEARCH_API_KEY or query the application's DB.
export const searchAiTags = createAiTagSearch({
  loadIndex,
  enrichImages,
  fetchRecommendations: recommendations,
  remoteSearch: (query, limit, signal) => searchDanbooru(
    { query, limit, show_nsfw: false }, signal, { quota: "public" },
  ),
});
