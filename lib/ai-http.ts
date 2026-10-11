import { AiSearchError, parseAiSearchInput, type AiSearchInput, type AiSearchResult } from "./ai-tag-search";

export const AI_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex",
};

/** Query strings arrive as text; numbers and the 0/1 boolean must be typed
 * before validation so malformed values are still rejected instead of coerced. */
function queryValue(key: string, value: string): unknown {
  if (["limit", "offset", "images"].includes(key))
    return /^\d+$/.test(value) ? Number(value) : value;
  if (key === "recommend")
    return value === "1" ? true : value === "0" ? false : value;
  return value;
}

export async function handleAiTagSearch(
  request: Request,
  search: (input: AiSearchInput, signal: AbortSignal) => Promise<AiSearchResult>,
) {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) {
      throw new AiSearchError("搜索参数不能重复。", 400);
    }
    const input = parseAiSearchInput(Object.fromEntries(
      [...params].map(([key, value]) => [key, queryValue(key, value)]),
    ));
    const data = await search(input, request.signal);
    return Response.json(data, {
      headers: { ...AI_CORS_HEADERS, "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    const status = error instanceof AiSearchError ? error.status : request.signal.aborted ? 499 : 503;
    return Response.json({
      error: error instanceof AiSearchError ? error.message : "搜索暂不可用，请稍后重试；远程失败不会使用本站私有额度。",
    }, { status, headers: {
      ...AI_CORS_HEADERS, "Cache-Control": "no-store",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    } });
  }
}

export async function readAiJson(request: Request, maxBytes = 16_384) {
  if (!request.body) throw new AiSearchError("缺少 JSON 请求。", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AiSearchError("请求内容过长。", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
