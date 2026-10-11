import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { buildAiGuide, buildAiSkill } from "../app/lib/ai-documents";
import { AiSearchError, parseAiSearchInput, type AiSearchInput, type AiSearchResult } from "./ai-tag-search";
import { aiRequestOrigin } from "./ai-document-response";
import { readAiJson } from "./ai-http";

type Search = (input: AiSearchInput, signal: AbortSignal) => Promise<AiSearchResult>;

export function createAiMcpServer(origin: string, search: Search, signal: AbortSignal) {
  const server = new McpServer({ name: "novelai-tags", version: "1.0.0" });
  const query = z.string().trim().min(1).max(300);
  const limit = z.number().int().min(1).max(50).default(20);
  const direction = z.enum(["auto", "tag-to-zh", "zh-to-tag"]).default("auto");
  async function run(input: Record<string, unknown>) {
    try {
      const result = await search(parseAiSearchInput(input), signal);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: error instanceof AiSearchError ?
        `${error.status}: ${error.message}` : "503: 搜索暂不可用。请保留本地结果；不会使用本站私有额度。" }] };
    }
  }
  server.registerTool("search_tags", {
    title: "中英文 Tags 互查",
    description: "Search the local general-audience dictionary by English tag, Chinese meaning or alias. Exact matches first. No database query or remote quota.",
    inputSchema: z.object({ query, direction, limit, offset: z.number().int().min(0).max(10_000).default(0) }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, (input) => run({ ...input, source: "local" }));
  server.registerTool("search_danbooru_tags", {
    title: "Danbooru 公共语义搜索",
    description: "Explicit remote semantic search using anonymous shared quota only, never a private key. Successes cached for one day. May be rate limited; prefer local search.",
    inputSchema: z.object({ query, limit }).strict(),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, (input) => run({ ...input, source: "danbooru" }));
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
