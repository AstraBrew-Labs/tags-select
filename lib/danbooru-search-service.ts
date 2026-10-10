import {
  DANBOORU_SERVICE_ERROR,
  applyDanbooruNsfwFilter,
  parseDanbooruData,
  parseDanbooruInput,
  type DanbooruSearchInput,
  type DanbooruSearchResponse,
} from "../app/lib/danbooru-types";
import { preprocessPromptQuery } from "../app/lib/prompt-preprocessing";

// Fixed destinations: callers cannot turn this endpoint into an arbitrary proxy.
export const DANBOORU_NODES = [
  {
    name: "domestic",
    url: "https://sakizuki-danboorusearchonline.ms.show/api/search",
    timeoutMs: 8_000,
  },
  {
    name: "international",
    url: "https://sakizuki-danboorusearch.hf.space/api/search",
    timeoutMs: 15_000,
  },
] as const;
type Options = {
  apiKey?: string;
  fetcher?: typeof fetch;
  /** Dependency injection for deterministic timeout tests. */
  timeouts?: readonly [number, number];
};
class SearchUnavailable extends Error {
  constructor(public readonly timedOut: boolean) {
    super(DANBOORU_SERVICE_ERROR);
  }
}

/** Server transport; credentials are passed only by the server-only route. */
export async function searchDanbooru(
  input: DanbooruSearchInput,
  requestSignal: AbortSignal,
  { apiKey, fetcher = fetch, timeouts }: Options,
): Promise<DanbooruSearchResponse> {
  let timedOut = false;
  for (const [index, node] of DANBOORU_NODES.entries()) {
    requestSignal.throwIfAborted();
    if (node.name === "international" && !apiKey?.trim()) continue;
    const timeout = AbortSignal.timeout(timeouts?.[index] ?? node.timeoutMs);
    const signal = AbortSignal.any([requestSignal, timeout]);
    try {
      const response = await fetcher(node.url, {
        method: "POST",
        // Do not forward the international credential through redirects.
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
        body: JSON.stringify(input),
        signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        continue;
      }
      const data = parseDanbooruData(await response.json());
      // Body parsing is covered by the same per-node timeout.
      signal.throwIfAborted();
      if (data) {
        return {
          ...applyDanbooruNsfwFilter(data, input.show_nsfw),
          node: node.name,
        };
      }
    } catch {
      requestSignal.throwIfAborted();
      timedOut ||= timeout.aborted;
      // Network, non-JSON, schema and timeout failures all try the next node.
    }
  }
  throw new SearchUnavailable(timedOut);
}

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};
function errorResponse(error: string, status: number) {
  return Response.json({ error }, { status, headers });
}

/** Bound streamed input too, not just a caller-controlled Content-Length. */
async function readSmallJson(request: Request): Promise<unknown> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) {
        await reader.cancel();
        throw new Error("BodyTooLarge");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

export async function handleDanbooruSearch(
  request: Request,
  options: Options,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return errorResponse("此接口仅接受本站发起的搜索请求。", 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return errorResponse("请使用 JSON 格式提交搜索。", 415);
  let input: DanbooruSearchInput | null;
  try {
    input = parseDanbooruInput(await readSmallJson(request));
  } catch {
    return errorResponse("搜索请求格式无效或内容过长。", 400);
  }
  if (!input)
    return errorResponse(
      "请输入 1–300 个字符；结果数量须为 1–80 的整数。",
      400,
    );
  input = parseDanbooruInput({ ...input, query: preprocessPromptQuery(input.query) });
  if (!input) return errorResponse("去除加减权符号后没有有效标签，或清理后的搜索超过 300 个字符。", 400);
  try {
    const data = await searchDanbooru(input, request.signal, options);
    return Response.json(data, { headers });
  } catch (error) {
    if (request.signal.aborted)
      return errorResponse("搜索已取消。", 499);
    return errorResponse(
      DANBOORU_SERVICE_ERROR,
      error instanceof SearchUnavailable && error.timedOut ? 504 : 503,
    );
  }
}
