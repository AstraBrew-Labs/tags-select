import {
  CHARACTER_IMAGE_BLOCKED_TAGS,
  CHARACTER_IMAGE_CACHE_MAX_ENTRIES,
  CHARACTER_IMAGE_CACHE_TTL,
  isBlockedCharacterImageTag,
  isCharacterImageUrl,
  isDanbooruImageSizes,
  resolveValidCharacterImageTag,
  type CharacterImageResponse,
  type DanbooruImageSizes,
} from "../app/lib/character-image-types";
import { characterImageFetcher } from "./danbooru-character-image-fetch";

type CachedImage = {
  cachedAt: number;
  sizes: DanbooruImageSizes | null;
};
type ResolvedImage = {
  tag: string;
  sizes: DanbooruImageSizes | null;
  cached: boolean;
  cachedAt: number;
};
type CharacterImageOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

/** Danbooru's `-tag` operator makes the API itself skip blocked characters, so
 * a still-valid example image is preferred over an empty result. */
const BLOCKED_TAG_FILTERS = CHARACTER_IMAGE_BLOCKED_TAGS.map((tag) => `-${tag}`);

/** Defence in depth: a post whose own tags carry a blocked character is dropped
 * even if the upstream ignored the negative filter. */
function hasBlockedCharacterTag(post: Record<string, unknown>) {
  return ["tag_string", "tag_string_character"].some((field) => {
    const value = post[field];
    return (
      typeof value === "string" &&
      value.split(" ").some((token) => isBlockedCharacterImageTag(token))
    );
  });
}

/** One general-rating post becomes up to three official Danbooru sizes. */
function imageSizesFromPost(value: unknown): DanbooruImageSizes | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const post = value as Record<string, unknown>;
  if (post.rating !== "g") return null;
  if (hasBlockedCharacterTag(post)) return null;
  const pick = (key: string) => (isCharacterImageUrl(post[key]) ? post[key] : null);
  const sizes: DanbooruImageSizes = {
    preview: pick("preview_file_url"),
    sample: pick("large_file_url"),
    original: pick("file_url"),
  };
  return sizes.preview || sizes.sample || sizes.original ? sizes : null;
}

/** Preview first, then the ≤850px sample, then the original: the single-URL
 * order the tag cards relied on before multiple sizes were exposed. */
function preferredImageUrl(sizes: DanbooruImageSizes | null) {
  return sizes ? sizes.preview ?? sizes.sample ?? sizes.original : null;
}

function isFreshCachedImage(
  record: CachedImage | undefined,
  now: number,
): record is CachedImage {
  return (
    !!record &&
    Number.isFinite(record.cachedAt) &&
    record.cachedAt <= now &&
    now < record.cachedAt + CHARACTER_IMAGE_CACHE_TTL &&
    (record.sizes === null || isDanbooruImageSizes(record.sizes))
  );
}

export function createCharacterImageService({
  fetcher = characterImageFetcher.fetch,
  now = Date.now,
  timeoutMs = 10_000,
}: CharacterImageOptions = {}) {
  // The route-level singleton keeps this cache warm between requests. Keeping
  // it local to the service also makes injected test services independent.
  const cache = new Map<string, CachedImage>();
  const pending = new Map<
    string,
    { id: symbol; refresh: boolean; promise: Promise<ResolvedImage> }
  >();

  async function resolveSizes(
    rawTag: string,
    requestSignal?: AbortSignal,
    { refresh = false }: { refresh?: boolean } = {},
  ): Promise<ResolvedImage> {
    const tag = resolveValidCharacterImageTag(rawTag);
    if (!tag) throw new Error("标签格式无效。");
    const existing = pending.get(tag);
    if (existing && (!refresh || existing.refresh)) return existing.promise;
    const currentTime = now();
    const remembered = cache.get(tag);
    if (!refresh && isFreshCachedImage(remembered, currentTime)) {
      return { tag, sizes: remembered.sizes, cached: true, cachedAt: remembered.cachedAt };
    }
    const id = Symbol(tag);
    const promise = (async () => {
      const url = new URL("https://danbooru.donmai.us/posts.json");
      url.searchParams.set(
        "tags",
        [tag, "rating:g", ...BLOCKED_TAG_FILTERS].join(" "),
      );
      url.searchParams.set("limit", "1");
      url.searchParams.set(
        "only",
        "rating,preview_file_url,large_file_url,file_url,tag_string,tag_string_character",
      );
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = requestSignal
        ? AbortSignal.any([requestSignal, timeout])
        : timeout;
      const response = await fetcher(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Cache-Control": "no-cache",
          "User-Agent": "TagsSelect/0.1 (tag reference thumbnails)",
        },
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Danbooru 图片服务暂时不可用。");
      }
      const posts: unknown = await response.json();
      if (!Array.isArray(posts))
        throw new Error("Danbooru 图片服务返回的数据格式不正确。");
      const sizes = imageSizesFromPost(posts[0]);
      const result: ResolvedImage = { tag, sizes, cachedAt: now(), cached: false };
      // A refresh can supersede an older request still awaiting Danbooru.
      if (pending.get(tag)?.id === id) {
        cache.set(tag, { cachedAt: result.cachedAt, sizes });
        if (cache.size > CHARACTER_IMAGE_CACHE_MAX_ENTRIES)
          cache.delete(cache.keys().next().value!);
      }
      return result;
    })().finally(() => {
      if (pending.get(tag)?.id === id) pending.delete(tag);
    });
    pending.set(tag, { id, refresh, promise });
    return promise;
  }

  async function load(
    rawTag: string,
    requestSignal?: AbortSignal,
    options?: { refresh?: boolean },
  ): Promise<CharacterImageResponse> {
    const { tag, sizes, cached, cachedAt } = await resolveSizes(
      rawTag,
      requestSignal,
      options,
    );
    return { tag, imageUrl: preferredImageUrl(sizes), cached, cachedAt };
  }

  /** Multi-size lookup for the AI search path; the cache is shared with load. */
  async function loadSizes(
    rawTag: string,
  ): Promise<{ tag: string; sizes: DanbooruImageSizes | null; cached: boolean }> {
    const { tag, sizes, cached } = await resolveSizes(rawTag);
    return { tag, sizes, cached };
  }

  return { load, loadSizes };
}

// Shared between the same-site tag-card route and the AI tag search, so both
// reuse one weekly cache, blocked-tag filter and server-side proxy.
export const characterImageService = createCharacterImageService();

function errorResponse(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function handleCharacterImage(
  request: Request,
  options: { service?: typeof characterImageService } = {},
) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return errorResponse("此接口仅接受本站发起的请求。", 403);
  const params = new URL(request.url).searchParams;
  const tag = params.get("tag") ?? "";
  if (!resolveValidCharacterImageTag(tag))
    return errorResponse("请输入有效的标签。", 400);
  try {
    const result = await (options.service ?? characterImageService).load(
      tag,
      undefined,
      { refresh: params.get("refresh") === "1" },
    );
    const headers = {
      // URL caches own the weekly TTL; HTTP caching must not hide a refresh.
      "Cache-Control": "no-store",
      "X-Character-Image-Cache": result.cached ? "hit" : "miss",
      "X-Content-Type-Options": "nosniff",
    };
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResponse(
        "Danbooru 请求超时，请检查服务端网络或 DANBOORU_IMAGE_PROXY_URL 代理配置。",
        504,
      );
    }
    return errorResponse(
      error instanceof Error && error.message.startsWith("角色图片代理配置")
        ? error.message
        : "Danbooru 图片请求失败，请检查服务端网络或代理配置。",
      502,
    );
  }
}
