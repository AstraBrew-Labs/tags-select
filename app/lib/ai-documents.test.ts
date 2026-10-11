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
  test("OpenAPI advertises only the read-only search endpoint with bounded parameters and inline images", () => {
    const spec = buildAiOpenApi("https://api.test");
    expect(spec.servers).toEqual([{ url: "https://api.test" }]);
    expect(Object.keys(spec.paths)).toEqual(["/api/ai/tags"]);
    expect(Object.keys(spec.paths["/api/ai/tags"])).toEqual(["get"]);
    expect(spec.paths["/api/ai/tags"].get.security).toEqual([]);
    expect(spec.paths["/api/ai/tags"].get.parameters.find((item) => item.name === "limit")?.schema.maximum).toBe(50);
    const imagesParameter = spec.paths["/api/ai/tags"].get.parameters.find((item) => item.name === "images");
    expect(imagesParameter?.schema).toMatchObject({ minimum: 0, maximum: 50, default: 8 });
    const result = spec.paths["/api/ai/tags"].get.responses["200"].content["application/json"].schema.properties.results.items;
    expect(result.required).toContain("images");
    expect(Object.keys(result.properties.images.properties)).toEqual(["preview", "sample", "original"]);
    expect(spec.info.version).toBe("1.1.0");
    const example = spec.paths["/api/ai/tags"].get.responses["200"].content["application/json"].example;
    expect(example).toMatchObject({ images: 8, source: "local" });
    expect(Object.keys(example.results[0].images)).toEqual(["preview", "sample", "original"]);
  });
  test("documents the inline example images and offers no separate image endpoint", () => {
    for (const document of [buildAiDocument("markdown", "https://api.test"), buildAiDocument("text", "https://api.test"), buildAiSkill("https://api.test")]) {
      expect(document).toContain("images");
      expect(document).toContain("preview");
      expect(document).toContain("sample");
      expect(document).not.toContain("/api/ai/images");
      expect(document).not.toContain("get_tag_image");
    }
  });
  test("portable repository skill is generated from the same maintained source", async () => {
    const content = await readFile("skills/novelai-tags-search/SKILL.md", "utf8");
    expect(content).toBe(buildAiSkill(""));
    expect(content.startsWith("---\nname: novelai-tags-search\n")).toBe(true);
    expect(content).toContain("search_tags");
    expect(content).toContain("search_danbooru_tags");
  });
});
