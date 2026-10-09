import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import PromptLookup from "./prompt-lookup";
import { createTagCatalog } from "../lib/tag-catalog";
import type { CatalogResponse } from "../lib/catalog-types";

const response: CatalogResponse = {
  categories: [
    {
      id: "body",
      sourceKey: "Body",
      nameZh: "身体&发型",
      nameEn: "Body & Hair",
      count: 3,
    },
  ],
  groups: [{ id: "hair", categoryId: "body", nameZh: "发型", count: 3 }],
  tags: [
    {
      id: "long",
      categoryId: "body",
      groupId: "hair",
      zh: "长发",
      en: "long hair",
      aliases: [],
      note: null,
      imageUrl: null,
      popular: true,
    },
    {
      id: "quality",
      categoryId: "body",
      groupId: "hair",
      zh: "组合画质",
      en: "best quality, highres",
      aliases: [],
      note: null,
      imageUrl: null,
      popular: false,
    },
    {
      id: "empty-zh",
      categoryId: "body",
      groupId: "hair",
      zh: "",
      en: "solo",
      aliases: [],
      note: null,
      imageUrl: null,
      popular: false,
    },
  ],
  source: null,
};
const catalog = createTagCatalog(response);
function render(
  input: string,
  submitted = input,
  options: { loading?: boolean; error?: string; selected?: string[] } = {},
) {
  return renderToStaticMarkup(
    <PromptLookup
      catalog={catalog}
      input={input}
      submitted={submitted}
      loading={Boolean(options.loading)}
      error={options.error ?? null}
      retry={() => {}}
      onInputChange={() => {}}
      onSubmit={() => {}}
      selected={options.selected ?? []}
      favorites={[]}
      onAdd={() => {}}
      onFavorite={() => {}}
      onShowGenerator={() => {}}
    />,
  );
}

describe("prompt lookup panel", () => {
  test("provides a labeled multiline paste field and an initial invitation", () => {
    const html = render("");
    expect(html).toContain('for="prompt-lookup-input"');
    expect(html).toContain('<textarea id="prompt-lookup-input"');
    expect(html).toContain("查找提示词");
    expect(html).toContain("输入后点击“查找提示词”");
  });
  test("shows English, Chinese, source hierarchy and unmatched tokens separately", () => {
    const html = render("long_hair, unknown_tag");
    expect(html).toContain("long_hair");
    expect(html).toContain("长发");
    expect(html).toContain("身体&amp;发型");
    expect(html).toContain("发型");
    expect(html).toContain("解析 2 项 · 匹配 1 项 · 未匹配 1 项");
    expect(html).toContain("未匹配的提示词");
    expect(html).toContain("unknown_tag");
    expect(html).toContain("加入生成器");
  });
  test("missing Chinese does not display placeholder text", () => {
    const html = render("solo");
    expect(html).toContain("solo");
    expect(html).not.toContain("lookup-translation");
    expect(html).not.toContain("未提供中文名称");
  });
  test("labels composite matches and explains what gets added", () => {
    const html = render("best quality");
    expect(html).toContain("组合词条中的一项");
    expect(html).toContain("best quality, highres");
    expect(html).toContain("加入完整词条");
  });
  test("editing draft does not silently change previously submitted results", () => {
    const html = render("unknown_tag", "long hair");
    expect(html).toContain("输入已修改，请再次查找以更新结果");
    expect(html).toContain("长发");
    expect(html).not.toContain("未匹配的提示词");
  });
  test("loading and failed catalogs display explicit states", () => {
    expect(render("long hair", "long hair", { loading: true })).toContain(
      "正在加载标签库",
    );
    const html = render("long hair", "long hair", { error: "网络连接失败" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("网络连接失败");
    expect(html).toContain("重新加载");
    expect(html).not.toContain("lookup-results");
  });
});
