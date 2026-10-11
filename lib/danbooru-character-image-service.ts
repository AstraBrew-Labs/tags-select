import {
  CHARACTER_IMAGE_BLOCKED_TAGS,
  CHARACTER_IMAGE_CACHE_MAX_ENTRIES,
  isBlockedCharacterImageTag,
  isCharacterImageUrl,
  isFreshCharacterImage,
  resolveCharacterImageTag,
  type CharacterImageResponse,
} from "../app/lib/character-image-types";
import { characterImageFetcher } from "./danbooru-character-image-fetch";

type CachedImage = {
  cachedAt: number;
  imageUrl: string | null;
};
type CharacterImageOptions = {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};

const MAX_TAG_LENGTH = 200;
function validTag(value: string) {
  const tag = resolveCharacterImageTag(value);
  return (
    tag.length > 0 &&
    tag.length <= MAX_TAG_LENGTH &&
    !/[\u0000-\u001f\u007f]/.test(tag) &&
    !/[,:*]/.test(tag) &&
    !/^[-~]/.test(tag)
  )
    ? tag
    : null;
}

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

function imageUrlFromPost(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const post = value as Record<string, unknown>;
  if (post.rating !== "g") return null;
  if (hasBlockedCharacterTag(post)) return null;
  for (const key of ["preview_file_url", "large_file_url", "file_url"]) {
    if (isCharacterImageUrl(post[key])) return post[key];
  }
  return null;
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
    { id: symbol; refresh: boolean; promise: Promise<CharacterImageResponse> }
  >();

  async function load(
    rawTag: string,
    requestSignal?: AbortSignal,
    { refresh = false }: { refresh?: boolean } = {},
  ): Promise<CharacterImageResponse> {
    const tag = validTag(rawTag);
    if (!tag) throw new Error("标签格式无效。");
    const existing = pending.get(tag);
    if (existing && (!refresh || existing.refresh)) return existing.promise;
    const currentTime = now();
    const remembered = cache.get(tag);
    if (!refresh && isFreshCharacterImage(remembered, currentTime)) {
      return { tag, ...remembered, cached: true };
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
      const imageUrl = imageUrlFromPost(posts[0]);
      const result = { tag, imageUrl, cachedAt: now(), cached: false };
      // A refresh can supersede an older request still awaiting Danbooru.
      if (pending.get(tag)?.id === id) {
        cache.set(tag, { cachedAt: result.cachedAt, imageUrl });
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

  return { load };
}

const characterImageService = createCharacterImageService();

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
  if (!validTag(tag)) return errorResponse("请输入有效的标签。", 400);
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
