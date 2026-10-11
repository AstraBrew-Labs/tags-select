import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { isCatalogResponse } from "../app/lib/catalog-cache";
import { createAiTagIndex, createAiTagSearch } from "./ai-tag-search";
import { createAiTagImageEnricher } from "./ai-tag-images";
import { characterImageService } from "./danbooru-character-image-service";
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

// Deliberately never read DANBOORU_SEARCH_API_KEY or query the application's DB.
export const searchAiTags = createAiTagSearch({
  loadIndex,
  enrichImages,
  remoteSearch: (query, limit, signal) => searchDanbooru(
    { query, limit, show_nsfw: false }, signal, { quota: "public" },
  ),
});
