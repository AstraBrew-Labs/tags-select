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
    expect(html).not.toContain("https://tag-select.astrabrew.cn");
  });
});
