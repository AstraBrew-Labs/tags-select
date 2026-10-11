import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { AI_DOCUMENTS, buildAiDocument, buildAiSkill, buildAiOpenApi } from "./ai-documents";
import { aiDocumentResponse } from "../../lib/ai-document-response";

describe("portable AI documents and download URLs", () => {
  test("all documents follow the serving host without a hardcoded domain or private key", async () => {
    for (const origin of ["http://localhost:3107", "https://preview.test"]) {
      for (const item of AI_DOCUMENTS) {
        const response = aiDocumentResponse(new Request(origin + item.path), item.key);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(item.type);
        const content = await response.text();
        expect(content).toBe(buildAiDocument(item.key, origin));
        expect(content).toContain(origin);
        expect(content).not.toContain("https://tag-select.astrabrew.cn");
      }
    }
  });
  test("serves named downloadable attachments and rejects invalid parameters", () => {
    for (const item of AI_DOCUMENTS) {
      const response = aiDocumentResponse(new Request(`http://local.test${item.path}?download=1`), item.key);
      expect(response.headers.get("content-disposition")).toBe(`attachment; filename="${item.name}"`);
      for (const query of ["download=0", "download=1&download=1", "key=secret"]) {
        expect(aiDocumentResponse(new Request(`http://local.test${item.path}?${query}`), item.key).status).toBe(400);
      }
    }
  });
  test("OpenAPI advertises only a read-only endpoint with bounded search parameters", () => {
    const spec = buildAiOpenApi("https://api.test");
    expect(spec.servers).toEqual([{ url: "https://api.test" }]);
    expect(Object.keys(spec.paths["/api/ai/tags"])).toEqual(["get"]);
    expect(spec.paths["/api/ai/tags"].get.security).toEqual([]);
    expect(spec.paths["/api/ai/tags"].get.parameters.find((item) => item.name === "limit")?.schema.maximum).toBe(50);
  });
  test("portable repository skill is generated from the same maintained source", async () => {
    const content = await readFile("skills/novelai-tags-search/SKILL.md", "utf8");
    expect(content).toBe(buildAiSkill(""));
    expect(content.startsWith("---\nname: novelai-tags-search\n")).toBe(true);
    expect(content).toContain("search_tags");
    expect(content).toContain("search_danbooru_tags");
  });
});
