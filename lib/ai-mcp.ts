import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { buildAiGuide, buildAiSkill } from "../app/lib/ai-documents";
import { AI_SEARCH_LIMIT, AiSearchError, parseAiSearchInput, type AiSearchInput, type AiSearchResult } from "./ai-tag-search";
import { AI_TAG_IMAGE_DEFAULT } from "./ai-tag-images";
import { AI_QWEN_IMAGE_MODES, readAiPromptFormat, type AiPromptFormatName } from "./ai-prompt-formats";
import { aiRequestOrigin } from "./ai-document-response";
import { readAiJson } from "./ai-http";

type Search = (input: AiSearchInput, signal: AbortSignal) => Promise<AiSearchResult>;

export function createAiMcpServer(origin: string, search: Search, signal: AbortSignal) {
  const server = new McpServer({ name: "novelai-tags", version: "1.0.0" });
  const query = z.string().trim().min(1).max(300);
  const limit = z.number().int().min(1).max(50).default(20);
  const direction = z.enum(["auto", "tag-to-zh", "zh-to-tag"]).default("auto");
  const images = z.number().int().min(0).max(AI_SEARCH_LIMIT).default(AI_TAG_IMAGE_DEFAULT);
  const recommend = z.boolean().default(true);
  const showNsfw = z.boolean().default(false).describe(
    "Opt in to adult results: local r18 rows, Danbooru rows flagged nsfw and adult-rated example images. Off by default; only set it when the user asked for adult tags and is an adult.",
  );
  async function run(input: Record<string, unknown>) {
    try {
      const result = await search(parseAiSearchInput(input), signal);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: error instanceof AiSearchError ?
        `${error.status}: ${error.message}` : "503: 搜索暂不可用。请保留本地结果；不会使用本站私有额度。" }] };
    }
  }
  server.registerTool("search_all_tags", {
    title: "本地 + Danbooru 合并搜索与推荐",
    description: "Preferred one-call lookup: merge the local dictionary with Danbooru semantic matches, then add recommended artists, same-category and related tags plus inline example images. Uses the anonymous shared Danbooru quota, so it can be slower and rate limited; `unavailable` lists any part that failed. `show_nsfw` opts in to adult rows and adult-rated example images; it is off by default and only for an adult user who asked for them.",
    inputSchema: z.object({ query, direction, limit, offset: z.number().int().min(0).max(10_000).default(0), images, recommend, show_nsfw: showNsfw }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (input) => run({ ...input, source: "all" }));
  server.registerTool("search_tags", {
    title: "本地 Tags 中英互查",
    description: "Local-only dictionary lookup by English tag, Chinese meaning or alias. Exact matches first. Stays at zero remote quota (no recommendations, which need Danbooru); use search_all_tags for semantic matches plus recommendations. `show_nsfw` also unlocks the local r18 rows; it is off by default.",
    inputSchema: z.object({ query, direction, limit, offset: z.number().int().min(0).max(10_000).default(0), images, show_nsfw: showNsfw }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    // Recommendations always need the public Danbooru pool, so this tool opts out.
  }, (input) => run({ ...input, source: "local", recommend: false }));
  server.registerTool("search_danbooru_tags", {
    title: "Danbooru 公共语义搜索",
    description: "Explicit Danbooru-only semantic search using anonymous shared quota only, never a private key. Successes cached for one day. May be rate limited; prefer search_all_tags. `show_nsfw` asks the upstream for adult rows and is off by default.",
    inputSchema: z.object({ query, limit, images, recommend, show_nsfw: showNsfw }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (input) => run({ ...input, source: "danbooru" }));
  async function format(name: AiPromptFormatName, value?: string) {
    try {
      const spec = await readAiPromptFormat(name, value);
      return { content: [{ type: "text" as const, text: spec.text }] };
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: error instanceof AiSearchError ?
        `${error.status}: ${error.message}` : "503: 提示词格式规范暂不可用。" }] };
    }
  }
  const formatAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
  server.registerTool("get_anima_format", {
    title: "Anima Hybrid 提示词格式规范",
    description: "Complete Anima Hybrid prompt-format specification (Hard Tags plus Natural Language): composition modes, subject scale, foreground limits, lighting and colour roles, tag order and counts, weighting, and the multi-character separation rules. Static local reference text; no remote quota.",
    inputSchema: z.object({}).strict(),
    annotations: formatAnnotations,
  }, () => format("anima"));
  server.registerTool("get_newbie_format", {
    title: "NewBie XML 提示词格式规范",
    description: "Complete NewBie XML prompt-format specification: the character_N / general_tags / caption structure plus the situational causality lock, tag escaping, eight-dimension completion checks, conflict checks and multi-character anti-mixing rules. Static local reference text; no remote quota.",
    inputSchema: z.object({}).strict(),
    annotations: formatAnnotations,
  }, () => format("newbie"));
  server.registerTool("get_qwen_image_format", {
    title: "Qwen-Image-2.1 提示词格式规范",
    description: "Complete Qwen-Image-2.1 prompt-format specification. `mode` is required: T2I rewrites a text-to-image request, I2I rewrites an image-editing instruction. Returns the matching spec and its JSON output format. Static local reference text; no remote quota.",
    inputSchema: z.object({ mode: z.enum(AI_QWEN_IMAGE_MODES).describe("T2I 文生图，I2I 图生图") }).strict(),
    annotations: formatAnnotations,
  }, ({ mode }) => format("qwen_image", mode));
  server.registerResource("tag-search-guide", `${origin}/llm.md`, {
    title: "AI 搜索说明", mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildAiGuide(origin) }] }));
  server.registerResource("tag-search-skill", `${origin}/skills/novelai-tags-search/SKILL.md`, {
    title: "NovelAI Tags Search Skill", mimeType: "text/markdown",
  }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: buildAiSkill(origin) }] }));
  return server;
}

export async function handleAiMcp(request: Request, search: Search) {
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  function error(status: number, code: number, message: string) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });
  }
  if (request.method !== "POST") {
    const response = error(405, -32000, "无状态 MCP 仅支持 POST；不提供 SSE 或可删除会话。");
    response.headers.set("Allow", "POST");
    return response;
  }
  const origin = aiRequestOrigin(request);
  if (request.headers.has("origin") && request.headers.get("origin") !== origin) {
    return error(403, -32000, "不接受跨站浏览器 MCP 请求。");
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return error(415, -32000, "请使用 application/json。");
  }
  let parsedBody: unknown;
  try { parsedBody = await readAiJson(request); }
  catch (issue) { return error(issue instanceof AiSearchError ? issue.status : 400, -32700, "无效或过大的 JSON 请求。"); }
  const server = createAiMcpServer(origin, search, request.signal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody });
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  } finally { await server.close(); }
}
