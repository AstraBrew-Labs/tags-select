import {
  DANBOORU_RECOMMENDATION_TAG_LIMIT,
  DANBOORU_SERVICE_ERROR,
  parseDanbooruArtists,
  parseDanbooruRelated,
  type DanbooruRecommendationData,
} from "../app/lib/danbooru-types";

const NODES = [
  {
    name: "domestic",
    baseUrl: "https://sakizuki-danboorusearchonline.ms.show/api",
    timeoutMs: 20_000,
  },
  {
    name: "international",
    baseUrl: "https://sakizuki-danboorusearch.hf.space/api",
    timeoutMs: 30_000,
  },
] as const;
const CATEGORY_NAMES = new Set([
  "General",
  "Artist",
  "Copyright",
  "Character",
  "Meta",
]);
const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

type RecommendationInput = {
  tags: string[];
  categories: string[];
  show_nsfw: boolean;
};
type Options = {
  apiKey?: string;
  fetcher?: typeof fetch;
  timeouts?: readonly [number, number];
};
type ParsedRecommendation<T> = {
  data: T;
  node: "domestic" | "international";
};

function errorResponse(message: string, status: number) {
  return Response.json({ error: message }, { status, headers });
}

function parseInput(value: unknown): RecommendationInput | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const input = value as Record<string, unknown>;
  const tags = input.tags;
  const categories = input.categories;
  const showNsfw = input.show_nsfw ?? false;
  if (
    !Array.isArray(tags) ||
    tags.length < 1 ||
    tags.length > DANBOORU_RECOMMENDATION_TAG_LIMIT ||
    !tags.every(
      (tag) => typeof tag === "string" && tag.trim().length > 0 && tag.length <= 256,
    ) ||
    !Array.isArray(categories) ||
    categories.length > 5 ||
    !categories.every(
      (category) => typeof category === "string" && CATEGORY_NAMES.has(category),
    ) ||
    typeof showNsfw !== "boolean" ||
    Object.keys(input).some(
      (key) => !["tags", "categories", "show_nsfw"].includes(key),
    )
  )
    return null;
  const uniqueTags = [...new Set(tags.map((tag) => tag.trim()))];
  return {
    tags: uniqueTags,
    categories: [...new Set(categories as string[])],
    show_nsfw: showNsfw,
  };
}

async function requestWithFallback<T>(
  path: "/artists" | "/related",
  body: Record<string, unknown>,
  parse: (value: unknown) => T | null,
  requestSignal: AbortSignal,
  { apiKey, fetcher = fetch, timeouts }: Options,
): Promise<ParsedRecommendation<T>> {
  let timedOut = false;
  for (const [index, node] of NODES.entries()) {
    requestSignal.throwIfAborted();
    if (node.name === "international" && !apiKey?.trim()) continue;
    const timeout = AbortSignal.timeout(timeouts?.[index] ?? node.timeoutMs);
    const signal = AbortSignal.any([requestSignal, timeout]);
    try {
      const response = await fetcher(`${node.baseUrl}${path}`, {
        method: "POST",
        redirect: "error",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-DanbooruSearch-Client": "tag-select-astrabrew",
          "X-DanbooruSearch-Site": "https://tag-select.astrabrew.cn/",
          ...(node.name === "international"
            ? { Authorization: `Bearer ${apiKey!.trim()}` }
            : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        continue;
      }
      const data = parse(await response.json());
      signal.throwIfAborted();
      if (data) return { data, node: node.name };
    } catch {
      requestSignal.throwIfAborted();
      timedOut ||= timeout.aborted;
    }
  }
  throw new Error(timedOut ? "timeout" : DANBOORU_SERVICE_ERROR);
}

export async function handleDanbooruRecommendations(
  request: Request,
  options: Options,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return errorResponse("此接口仅接受本站发起的推荐请求。", 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return errorResponse("请使用 JSON 格式提交推荐请求。", 415);
  let input: RecommendationInput | null;
  try {
    input = parseInput(await request.json());
  } catch {
    input = null;
  }
  if (!input)
    return errorResponse("请选择 1–8 个有效的 Danbooru 标签。", 400);

  const common = {
    tags: input.tags,
    show_nsfw: input.show_nsfw,
  };
  try {
    const [artists, sameCategory, related] = await Promise.all([
      requestWithFallback(
        "/artists",
        { ...common, limit: 12, min_cooc: 3 },
        parseDanbooruArtists,
        request.signal,
        options,
      ),
      requestWithFallback(
        "/related",
        {
          ...common,
          limit: 24,
          target_categories: input.categories.length
            ? input.categories
            : null,
        },
        parseDanbooruRelated,
        request.signal,
        options,
      ),
      requestWithFallback(
        "/related",
        {
          ...common,
          limit: 24,
          target_categories: null,
        },
        parseDanbooruRelated,
        request.signal,
        options,
      ),
    ]);
    const data: DanbooruRecommendationData = {
      artists: artists.data,
      sameCategory: sameCategory.data,
      related: related.data.filter(
        (item) => !sameCategory.data.some((same) => same.tag === item.tag),
      ),
      nodes: {
        artists: artists.node,
        sameCategory: sameCategory.node,
        related: related.node,
      },
    };
    return Response.json(data, { headers });
  } catch (error) {
    if (request.signal.aborted)
      return errorResponse("推荐请求已取消。", 499);
    const timedOut = error instanceof Error && error.message === "timeout";
    return errorResponse(
      DANBOORU_SERVICE_ERROR,
      timedOut ? 504 : 503,
    );
  }
}
