import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import AboutSite, { REPO_URL } from "./about-site";

describe("about site", () => {
  test("introduces the tool and its main features", () => {
    const html = renderToStaticMarkup(<AboutSite />);
    for (const text of [
      "非官方",
      "提示词辅助工具",
      "发现标签",
      "搜索标签",
      "AI 搜索",
      "个人法典与成人法典",
    ]) {
      expect(html).toContain(text);
    }
  });
  test("exposes the open-source repository link", () => {
    const html = renderToStaticMarkup(<AboutSite />);
    expect(REPO_URL).toBe("https://github.com/AstraBrew-Labs/tags-select");
    expect(html).toContain(`href="${REPO_URL}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain("rel=\"noreferrer noopener\"");
    expect(html).toContain("AstraBrew-Labs/tags-select");
  });
});
