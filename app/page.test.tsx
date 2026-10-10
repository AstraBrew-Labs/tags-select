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
});
