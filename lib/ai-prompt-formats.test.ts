import { describe, expect, test } from "bun:test";
import {
  AI_PROMPT_FORMAT_NAMES,
  aiPromptFormatIndex,
  handleAiPromptFormat,
  readAiPromptFormat,
} from "./ai-prompt-formats";
import { AiSearchError } from "./ai-tag-search";

const get = (query = "") => handleAiPromptFormat(new Request(`http://localhost:3107/api/ai/formats${query}`));

describe("prompt format specifications over HTTP", () => {
  test("lists every specification and marks the required qwen mode", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const body = await response.json();
    expect(body.formats.map((item: { format: string }) => item.format)).toEqual([...AI_PROMPT_FORMAT_NAMES]);
    for (const item of body.formats) {
      expect(item.summary.length).toBeGreaterThan(0);
      expect(item.url.startsWith("http://localhost:3107/api/ai/formats?format=")).toBe(true);
    }
    expect(body.formats[0]).toMatchObject({ format: "anima", mode_required: false, modes: [], mcp_tool: "get_anima_format" });
    expect(body.formats[2]).toMatchObject({
      format: "qwen_image", mode_required: true, modes: ["T2I", "I2I"],
      url: "http://localhost:3107/api/ai/formats?format=qwen_image&mode=T2I",
      mcp_tool: "get_qwen_image_format",
    });
    expect(aiPromptFormatIndex("https://api.test").formats[1]).toMatchObject({
      format: "newbie", url: "https://api.test/api/ai/formats?format=newbie",
    });
  });
  test("returns each specification as plain text and labels the response", async () => {
    const anima = await get("?format=anima");
    expect(anima.status).toBe(200);
    expect(anima.headers.get("content-type")).toContain("text/plain");
    expect(anima.headers.get("x-prompt-format")).toBe("anima");
    expect(anima.headers.get("x-prompt-mode")).toBeNull();
    const text = await anima.text();
    expect(text.startsWith("# Anima Hybrid Prompt Format Specification")).toBe(true);
    expect(text).toContain("多人物特征分离规则");

    expect((await (await get("?format=newbie")).text()).startsWith("# NewBie XML Prompt Format Specification")).toBe(true);

    const t2i = await get("?format=qwen_image&mode=T2I");
    expect(t2i.headers.get("x-prompt-mode")).toBe("T2I");
    expect(await t2i.text()).toContain("Image Prompt Rewriting Expert");

    const i2i = await get("?format=qwen_image&mode=I2I");
    expect(i2i.headers.get("x-prompt-mode")).toBe("I2I");
    expect(await i2i.text()).toContain("Edit Prompt Enhancer");
  });
  test("requires the qwen mode and rejects unknown, repeated or misplaced parameters", async () => {
    for (const query of [
      "?format=qwen_image", "?format=qwen_image&mode=x", "?format=anima&mode=T2I",
      "?format=unknown", "?format=anima&format=newbie", "?key=1", "?format=anima&download=1", "?mode=T2I",
    ]) {
      const response = await get(query);
      expect(response.status).toBe(400);
      expect(typeof (await response.json()).error).toBe("string");
    }
  });
  test("readAiPromptFormat normalises the request and never invents a spec", async () => {
    await expect(readAiPromptFormat("nope")).rejects.toBeInstanceOf(AiSearchError);
    await expect(readAiPromptFormat("anima", "T2I")).rejects.toThrow("不接受 mode");
    await expect(readAiPromptFormat("qwen_image")).rejects.toThrow("必填 mode");
    await expect(readAiPromptFormat("qwen_image", "t2i")).rejects.toThrow("mode 须为");
    const spec = await readAiPromptFormat("qwen_image", "I2I");
    expect(spec).toMatchObject({ format: "qwen_image", mode: "I2I" });
    expect(spec.text.length).toBeGreaterThan(1000);
  });
});
