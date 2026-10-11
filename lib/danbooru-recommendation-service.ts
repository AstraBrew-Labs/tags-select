import {
  DANBOORU_RECOMMENDATION_TAG_LIMIT,
  DANBOORU_SERVICE_ERROR,
  parseDanbooruArtists,
  parseDanbooruRelated,
  type DanbooruArtistRecommendation,
  type DanbooruRecommendationData,
  type DanbooruRelatedRecommendation,
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
  /** AI callers use only the anonymous shared pool, never site credentials. */
  quota?: "site" | "public";
  /**
   * Keep the buckets that answered when a sibling request fails. The AI search
   * has no error channel for recommendations, so a single slow or rejected
   * sub-request must not blank artists, same-category and related at once.
   * The same-site page keeps the strict mode and shows one error to retry.
   */
  partial?: boolean;
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
  { apiKey, quota = "site", fetcher = fetch, timeouts }: Options,
): Promise<ParsedRecommendation<T>> {
  let timedOut = false;
  for (const [index, node] of NODES.entries()) {
    requestSignal.throwIfAborted();
    if (node.name === "international" && quota !== "public" && !apiKey?.trim()) continue;
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
          ...(quota === "site" ? {
            "X-DanbooruSearch-Client": "tag-select-astrabrew",
            "X-DanbooruSearch-Site": "https://tag-select.astrabrew.cn/",
          } : {}),
          ...(quota === "site" && node.name === "international"
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

/**
 * Shared by the same-site route and the read-only AI search. The AI path passes
 * `quota: "public"` so it never sends the site's registration headers or key,
 * plus `partial: true` so a failing bucket cannot empty the other two.
 */
export async function fetchDanbooruRecommendations(
  input: { tags: string[]; categories: string[]; show_nsfw: boolean },
  requestSignal: AbortSignal,
  options: Options,
): Promise<DanbooruRecommendationData> {
  const common = { tags: input.tags, show_nsfw: input.show_nsfw };
  // Without a category filter the two related calls would return the same rows,
  // so the filtered one is skipped entirely instead of being discarded later.
  const filtered = input.categories.length > 0;
  const attempts = [
    () => requestWithFallback(
      "/artists",
      { ...common, limit: 12, min_cooc: 3 },
      parseDanbooruArtists,
      requestSignal,
      options,
    ),
    ...(filtered ? [() => requestWithFallback(
      "/related",
      { ...common, limit: 24, target_categories: input.categories },
      parseDanbooruRelated,
      requestSignal,
      options,
    )] : []),
    () => requestWithFallback(
      "/related",
      { ...common, limit: 24, target_categories: null },
      parseDanbooruRelated,
      requestSignal,
      options,
    ),
  ];
  const settled = await Promise.allSettled(attempts.map((run) => run()));
  const rejected = settled.filter(
    (item): item is PromiseRejectedResult => item.status === "rejected",
  );
  // Nothing usable at all, or a caller that wants a hard failure: propagate so
  // the same-site page keeps its 503/504 retry, and the AI search can report
  // `unavailable: ["recommendations"]` instead of pretending there is no data.
  if (rejected.length > 0 && (rejected.length === settled.length || !options.partial))
    throw rejected[0].reason;

  const rows = <T>(index: number): T[] => {
    const item = settled[index];
    return item.status === "fulfilled" ? (item.value.data as T[]) : [];
  };
  const artists = rows<DanbooruArtistRecommendation>(0);
  const sameCategory = filtered ? rows<DanbooruRelatedRecommendation>(1) : [];
  const related = rows<DanbooruRelatedRecommendation>(filtered ? 2 : 1);
  const served = settled.reduce<"domestic" | "international">(
    (node, item) => (item.status === "fulfilled" ? item.value.node : node),
    "domestic",
  );
  return {
    artists,
    sameCategory,
    related: related.filter(
      (item) => !sameCategory.some((same) => same.tag === item.tag),
    ),
    nodes: { artists: served, sameCategory: served, related: served },
  };
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

  try {
    const data = await fetchDanbooruRecommendations(input, request.signal, options);
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
