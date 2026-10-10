import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectorCodexPanel, INITIAL_CODEX_VIEW } from "./director-codex";
import { codexFixture } from "../lib/codex-fixtures.test";
import type { CodexCatalog } from "../lib/director-codex";

function render(options: {
  data?: CodexCatalog | null; loading?: boolean; error?: string;
  query?: string; categoryId?: string; page?: number;
} = {}) {
  return renderToStaticMarkup(<DirectorCodexPanel
    data={options.data === undefined ? codexFixture : options.data}
    loading={options.loading ?? false} error={options.error ?? null} retry={() => {}}
    view={{ ...INITIAL_CODEX_VIEW, query: options.query ?? "", categoryId: options.categoryId ?? "all", page: options.page ?? 1 }}
    onViewChange={() => {}} onLookup={() => {}}
  />);
}
describe("director codex native component composition", () => {
  test("shows provenance, category navigation, headings and original weighted groups", () => {
    const html = render();
    expect(html).toContain("所长的个人法典");
    expect(html).toContain("2026.5.1");
    expect(html).toContain("2026-10-10");
    expect(html).toContain("一般所长");
    expect(html).toContain("水彩风格");
    expect(html).toContain("{watercolor}, 0.7::lineart::, artist:example");
    expect(html).toContain("请勿添加额外画风");
    expect(html).toContain('aria-label="搜索法典标题与标签组"');
    expect(html).toContain('aria-label="复制水彩风格 · 标签组 1"');
    expect(html).toContain("复制全部");
    expect(html).toContain("查找组内标签");
    expect(html).not.toContain("<img");
  });
  test("search and chapter filters restrict cards and display empty-state recovery", () => {
    expect(render({ query: "watercolor" })).not.toContain("<h3>冬季大衣</h3>");
    expect(render({ categoryId: "winter" })).not.toContain("<h3>水彩风格</h3>");
    const html = render({ query: "missing" });
    expect(html).toContain("没有找到对应的标题或标签组");
    expect(html).toContain("浏览全部分类");
    expect(html).not.toContain("codex-entry-card");
  });
  test("initial loading and database errors do not fall back to sample recipes", () => {
    const loading = render({ data: null, loading: true });
    expect(loading).toContain("正在从数据库加载法典");
    expect(loading).not.toContain("codex-entry-card");
    const error = render({ data: null, error: "数据库不可用" });
    expect(error).toContain('role="alert"');
    expect(error).toContain("数据库不可用");
    expect(error).toContain("重新加载法典");
  });
  test("long groups remain scrollable/selectable and provide expansion rather than ellipsis", () => {
    const data = structuredClone(codexFixture);
    data.entries[0].groups[0].prompt = "watercolor, ".repeat(50);
    data.entries[0].groups.push({ label: "标签组 2", prompt: "sketch" }, { label: "标签组 3", prompt: "lineart" });
    const html = render({ data });
    expect(html).toContain("展开标签组");
    expect(html).toContain("展开其余 1 个标签组");
    expect(html).toContain("watercolor, ".repeat(50));
    expect(html).toMatch(/tabindex="0"/i);
  });
  test("paginates titles instead of mounting the entire source", () => {
    const data = structuredClone(codexFixture);
    data.entries = Array.from({ length: 25 }, (_, index) => ({
      ...data.entries[0], id: `entry-${index}`, title: `示例 ${index}`, anchor: `example-${index}`,
    }));
    data.categories = [{ id: "style", title: "各种风格", count: 25 }];
    const html = render({ data, page: 2 });
    expect(html).toContain("<h3>示例 12</h3>");
    expect(html).toContain("<h3>示例 23</h3>");
    expect(html).not.toContain("<h3>示例 0</h3>");
    expect(html).not.toContain("<h3>示例 24</h3>");
    expect(html).toContain('aria-label="分页"');
  });
});
