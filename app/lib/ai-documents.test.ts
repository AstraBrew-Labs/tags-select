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
  test("OpenAPI advertises the merged read-only search with bounded parameters, recommendations and images", () => {
    const spec = buildAiOpenApi("https://api.test");
    expect(spec.servers).toEqual([{ url: "https://api.test" }]);
    expect(Object.keys(spec.paths)).toEqual(["/api/ai/tags", "/api/ai/formats"]);
    expect(Object.keys(spec.paths["/api/ai/tags"])).toEqual(["get"]);
    expect(spec.paths["/api/ai/tags"].get.security).toEqual([]);
    const parameters = spec.paths["/api/ai/tags"].get.parameters;
    const byName = (name: string) => parameters.find((item) => item.name === name);
    expect(byName("limit")?.schema).toMatchObject({ minimum: 1, maximum: 50, default: 20 });
    expect(byName("source")?.schema).toMatchObject({ enum: ["all", "local", "danbooru"], default: "all" });
    expect(byName("images")?.schema).toMatchObject({ minimum: 0, maximum: 50, default: 8 });
    expect(byName("recommend")?.schema).toMatchObject({ type: "boolean", default: true });
    expect(byName("show_nsfw")?.schema).toMatchObject({ type: "boolean", default: false });
    const response = spec.paths["/api/ai/tags"].get.responses["200"].content["application/json"];
    const result = response.schema.properties.results.items;
    expect(result.required).toContain("images");
    expect(result.required).toContain("source");
    expect(result.required).toContain("filled_fields");
    expect(result.required).toContain("adult");
    expect(result.properties.source.enum).toEqual(["local", "danbooru", "local+danbooru"]);
    expect(Object.keys(result.properties.images.properties)).toEqual(["preview", "sample", "original"]);
    expect(response.schema.required).toEqual(expect.arrayContaining(["counts", "unavailable", "recommendations", "recommend", "show_nsfw"]));
    expect(response.schema.properties.show_nsfw).toMatchObject({ type: "boolean" });
    expect(response.schema.properties.counts.required).toEqual(["local", "danbooru", "merged"]);
    expect(response.schema.properties.unavailable.items.enum).toEqual(["danbooru", "recommendations"]);
    expect(Object.keys(response.schema.properties.recommendations.properties)).toEqual(["basedOn", "artists", "sameCategory", "related"]);
    expect(spec.info.version).toBe("1.5.0");
    expect(response.example).toMatchObject({
      images: 8, recommend: true, show_nsfw: false, source: "all",
      counts: { local: 1, danbooru: 1, merged: 1 }, unavailable: [],
    });
    expect(response.example.results.map((item) => item.source)).toEqual(["local+danbooru", "danbooru"]);
    expect(response.example.results[0].filled_fields).toEqual(["note"]);
    expect(response.example.results.map((item) => item.adult)).toEqual([false, false]);
    expect(Object.keys(response.example.results[0].images)).toEqual(["preview", "sample", "original"]);
    expect(response.example.recommendations.basedOn).toHaveLength(2);
  });
  test("documents the merged search, recommendations and inline images with no separate endpoints", () => {
    for (const document of [buildAiDocument("markdown", "https://api.test"), buildAiDocument("text", "https://api.test"), buildAiSkill("https://api.test")]) {
      for (const marker of ["images", "preview", "sample", "recommendations", "search_all_tags", "unavailable", "local+danbooru", "filled_fields"]) {
        expect(document).toContain(marker);
      }
      expect(document).not.toContain("/api/ai/images");
      expect(document).not.toContain("get_tag_image");
    }
  });
  test("documents the opt-in adult switch as default-off on every surface", () => {
    for (const document of [buildAiDocument("markdown", "https://api.test"), buildAiDocument("text", "https://api.test"), buildAiSkill("https://api.test")]) {
      expect(document).toContain("show_nsfw");
      expect(document).toContain("adult");
      // The old blanket "general audience only" claim must be gone.
      expect(document).not.toContain("仅开放普通标签");
      expect(document).not.toContain("exposes general-audience tags");
    }
    const spec = buildAiOpenApi("https://api.test");
    expect(spec.info.description).toContain("show_nsfw=true");
  });
  test("documents the three prompt-format specifications and their required qwen mode", () => {
    for (const document of [buildAiDocument("markdown", "https://api.test"), buildAiDocument("text", "https://api.test"), buildAiSkill("https://api.test")]) {
      expect(document).toContain("https://api.test/api/ai/formats");
      for (const marker of ["anima", "newbie", "qwen_image", "get_anima_format", "get_newbie_format", "get_qwen_image_format", "T2I", "I2I"]) {
        expect(document).toContain(marker);
      }
    }
    const formats = buildAiOpenApi("https://api.test").paths["/api/ai/formats"].get;
    expect(formats.security).toEqual([]);
    expect(Object.keys(formats.responses)).toEqual(["200", "400"]);
    const byName = (name: string) => formats.parameters.find((item) => item.name === name);
    expect(byName("format")?.schema).toMatchObject({ enum: ["anima", "newbie", "qwen_image"] });
    expect(byName("mode")?.schema).toMatchObject({ enum: ["T2I", "I2I"] });
    const index = formats.responses["200"].content["application/json"].schema.properties.formats.items;
    expect(index.required).toEqual(expect.arrayContaining(["format", "mode_required", "modes", "url", "mcp_tool"]));
  });
  test("portable repository skill is generated from the same maintained source", async () => {
    const content = await readFile("skills/novelai-tags-search/SKILL.md", "utf8");
    expect(content).toBe(buildAiSkill(""));
    expect(content.startsWith("---\nname: novelai-tags-search\n")).toBe(true);
    expect(content).toContain("search_all_tags");
    expect(content).toContain("recommendations");
    expect(content).toContain("images");
  });
});
