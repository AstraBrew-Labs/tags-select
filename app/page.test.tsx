import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "./page";

/** Render the actual route tree, not only isolated leaf components. */
describe("homepage server render", () => {
  test("renders the initial route shell without browser APIs or removed state names", () => {
    let html = "";
    expect(() => {
      html = renderToStaticMarkup(<Home />);
    }).not.toThrow();
    expect(html).toContain("提示词生成");
    expect(html).toContain("提示词查找");
    expect(html).toContain("所长的个人法典");
    expect(html).toContain("所长的成人法典");
    expect(html.indexOf("提示词查找")).toBeLessThan(html.indexOf("所长的个人法典"));
    expect(html.indexOf("所长的个人法典")).toBeLessThan(html.indexOf("所长的成人法典"));
    expect(html).toContain("搜索标签");
    expect(html).toContain("我的提示词");
    expect(html).toContain("发现你的灵感");
    expect(html).toContain("正在从数据库加载标签");
    expect(html).not.toContain("ReferenceError");
  });
  test("keeps empty conditional filters out of the static shell", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain("常用推荐");
    expect(html).not.toContain("我的收藏");
    expect(html).not.toContain("已选择 0");
  });
  test("removes the entire bottom inspiration banner", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).not.toContain("bottom-banner");
    expect(html).not.toContain("好画面，始于一个小小的灵感。");
    expect(html).not.toContain("不确定从哪里开始？");
    expect(html).not.toContain("试试灵感配方");
    expect(html).toContain("灵感配方");
  });
  test("keeps the Danbooru reference disclaimer visible in discovery", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toContain('class="tag-image-disclaimer"');
    expect(html).toContain("Tags 的例图由 Danbooru 提供");
    expect(html).toContain("可能与 tag 本身的意思并没有关系，仅供参考");
  });
  test("keeps the product heading in the static shell while SEO resolves the request origin", () => {
    const html = renderToStaticMarkup(<Home />);
    expect(html).toMatch(/<h1[^>]*>NovelAI Tags <span>选择器<\/span><\/h1>/);
    expect(html).not.toContain("https://tag-select.astrabrew.cn");
  });
});
