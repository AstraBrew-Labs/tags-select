import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import UsageGuide from "./usage-guide";

describe("usage guide", () => {
  test("covers discovery, standalone copying, weighting, lookup and both codexes", () => {
    const html = renderToStaticMarkup(<UsageGuide />);
    for (const text of [
      "发现标签", "单独复制", "不改变选择", "misaka_mikoto",
      "NovelAI 数值格式", "提示词查找", "个人法典与成人法典", "占位符",
    ]) expect(html).toContain(text);
  });
  test("explains remote search and distinguishes recommendation selection from discovery", () => {
    const html = renderToStaticMarkup(<UsageGuide />);
    for (const text of [
      "搜索标签", "Danbooru Tag Searcher API", "复制全部",
      "推荐擅长画师", "同类标签", "关联推荐",
      "不会加入发现页", "搜索历史", "18 岁",
    ]) expect(html).toContain(text);
  });
  test("attributes internet data and discloses external requests and local storage", () => {
    const html = renderToStaticMarkup(<UsageGuide />);
    expect(html).toContain("数据来自互联网");
    expect(html).toContain("不写入本站数据库");
    expect(html).toContain("不会跨设备自动同步");
    expect(html).not.toContain("loadTags");
    expect(html).not.toContain("loadtag");
    expect(html).not.toContain("条数据库标签");
  });
  test("discloses reference-image attribution, limitations and caching", () => {
    const html = renderToStaticMarkup(<UsageGuide />);
    expect(html).toContain("Tags 的例图由 Danbooru 提供");
    expect(html).toContain("可能与 tag 本身的意思并没有关系，仅供参考");
    expect(html).toContain("组合词条以首个标签");
    expect(html).toContain("缓存一周");
  });
});
