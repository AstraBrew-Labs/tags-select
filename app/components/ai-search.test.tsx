import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import AiSearch from "./ai-search";

describe("AI integration workspace", () => {
  test("renders all files, their content and separate copy URL/content/download controls", () => {
    const html = renderToStaticMarkup(<AiSearch />);
    for (const name of ["llm.txt", "llm.md", "SKILL.md", "mcp.json", "openapi.json"]) expect(html).toContain(name);
    expect(html).toContain('aria-label="复制 llm.txt 内容"');
    expect(html).toContain('aria-label="复制 llm.txt URL"');
    expect(html).toContain('aria-label="下载 llm.txt"');
    expect(html).toContain('aria-label="llm.txt 内容"');
    for (const label of ["复制内容", "复制 URL", "下载文件"]) {
      expect(html).toContain(`class="ai-action-label">${label}</span>`);
    }
    expect(html).not.toContain("https://tag-select.astrabrew.cn");
  });
  test("links the prompt-format specification endpoint next to the tag API and MCP", () => {
    const html = renderToStaticMarkup(<AiSearch />);
    expect(html).toContain("/api/ai/tags");
    expect(html).toContain("/api/ai/mcp");
    expect(html).toContain("/api/ai/formats");
    expect(html).toContain("提示词格式规范");
  });
});
