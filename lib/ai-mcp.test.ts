import { describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleAiMcp } from "./ai-mcp";
import { AI_TAG_IMAGE_DEFAULT } from "./ai-tag-images";
import type { AiSearchInput } from "./ai-tag-search";

const search = async (input: AiSearchInput) => ({
  ...input, total: 1, has_more: false,
  counts: { local: 1, danbooru: 0 }, unavailable: [] as never[],
  recommendations: null,
  results: [{
    id: "test", tag: "misaka_mikoto", zh: "御坂美琴", aliases: [], category: "characters",
    category_name: "角色", group: "某科学", note: null, match: "exact" as const,
    source: "local" as const, images: null,
  }],
});
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("http://localhost:3107/api/ai/mcp", {
  method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
  body: JSON.stringify(body),
});

describe("real read-only MCP protocol", () => {
  test("standard SDK client initializes, lists tools, calls search and reads resources", async () => {
    const calls: AiSearchInput[] = [];
    const client = new Client({ name: "test-agent", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3107/api/ai/mcp"), {
      fetch: ((url, init) => handleAiMcp(new Request(url, init), async (input) => {
        calls.push(input); return search(input);
      })) as typeof fetch,
    });
    try {
      await client.connect(transport);
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name)).toEqual([
        "search_all_tags", "search_tags", "search_danbooru_tags",
        "get_anima_format", "get_newbie_format", "get_qwen_image_format",
      ]);
      for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
      const combined = await client.callTool({ name: "search_all_tags", arguments: { query: "御坂美琴", images: 0, recommend: false } });
      expect(combined.isError).not.toBe(true);
      expect(combined.structuredContent).toMatchObject({ source: "all", images: 0, recommend: false });
      const local = await client.callTool({ name: "search_tags", arguments: { query: "御坂美琴", images: 0 } });
      expect(local.isError).not.toBe(true);
      expect(local.structuredContent).toMatchObject({ source: "local" });
      await client.callTool({ name: "search_danbooru_tags", arguments: { query: "白色水手服" } });
      expect(calls.map((input) => input.source)).toEqual(["all", "local", "danbooru"]);
      // Inline images default on and can be switched off per call.
      expect(calls[0].images).toBe(0);
      expect(calls[2].images).toBe(AI_TAG_IMAGE_DEFAULT);
      expect(calls[0].recommend).toBe(false);
      expect(calls[1].recommend).toBe(true);
      const { resources } = await client.listResources();
      expect(resources).toHaveLength(2);
      const resource = await client.readResource({ uri: resources[0].uri });
      expect(resource.contents[0]).toMatchObject({ mimeType: "text/markdown" });
      expect(resource.contents[0].text).toContain("http://localhost:3107/api/ai/tags");
      // Prompt-format specs are static local text: no search call is made for them.
      const callsBeforeFormats = calls.length;
      const textOf = (result: { content: { type: string; text?: string }[] }) => {
        const block = result.content[0];
        if (block.type !== "text" || typeof block.text !== "string") throw new Error("expected a text block");
        return block.text;
      };
      const anima = await client.callTool({ name: "get_anima_format", arguments: {} });
      expect(anima.isError).not.toBe(true);
      expect(textOf(anima)).toContain("# Anima Hybrid Prompt Format Specification");
      const newbie = await client.callTool({ name: "get_newbie_format", arguments: {} });
      expect(textOf(newbie)).toContain("# NewBie XML Prompt Format Specification");
      const qwen = await client.callTool({ name: "get_qwen_image_format", arguments: { mode: "I2I" } });
      expect(qwen.isError).not.toBe(true);
      expect(textOf(qwen)).toContain("Edit Prompt Enhancer");
      expect((await client.callTool({ name: "get_qwen_image_format", arguments: {} })).isError).toBe(true);
      expect(calls.length).toBe(callsBeforeFormats);
    } finally { await client.close(); }
  });
  test("rejects private-key parameters before calling the service", async () => {
    let calls = 0;
    const res = await handleAiMcp(request({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "search_danbooru_tags", arguments: { query: "x", apiKey: "secret" } },
    }), async (input) => { calls++; return search(input); });
    const result = await res.json();
    expect(result.result.isError).toBe(true);
    expect(calls).toBe(0);
  });
  test("bounds body parsing and rejects cross-site origins and incorrect content types", async () => {
    const payload = { jsonrpc: "2.0", id: 1, method: "ping" };
    expect((await handleAiMcp(request(payload, { Origin: "https://evil.test" }), search)).status).toBe(403);
    expect((await handleAiMcp(request(payload, { "Content-Type": "text/plain" }), search)).status).toBe(415);
    expect((await handleAiMcp(request({ ...payload, padding: "x".repeat(20_000) }), search)).status).toBe(413);
    expect((await handleAiMcp(new Request("http://localhost:3107/api/ai/mcp"), search)).status).toBe(405);
  });
});
