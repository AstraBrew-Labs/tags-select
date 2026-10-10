import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogGroup } from "../lib/catalog-types";
import TagGroupTabs from "./tag-group-tabs";

const groups: CatalogGroup[] = [
  { id: "characters:genshin", categoryId: "characters", nameZh: "原神", count: 100 },
  { id: "characters:arknights", categoryId: "characters", nameZh: "明日方舟", count: 80 },
  { id: "body:hair", categoryId: "body", nameZh: "发型", count: 50 },
];

function render(category = "characters", value = "all") {
  return renderToStaticMarkup(
    <TagGroupTabs
      category={category}
      categoryName="游戏&角色"
      groups={groups}
      totalCount={180}
      value={value}
      onChange={() => {}}
    >
      <div data-testid="tag-results">当前标签内容</div>
    </TagGroupTabs>,
  );
}

describe("subgroup tabs", () => {
  test("shows the library tabs with names and counts instead of a selector", () => {
    const html = render();
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="游戏&amp;角色子分组"');
    expect(html).toContain("全部分组");
    expect(html).toContain("原神");
    expect(html).toContain("明日方舟");
    expect(html).toContain('class="group-tab-count">100');
    expect(html).toContain('class="group-tab-count">180');
    expect(html).not.toContain("发型");
    expect(html).not.toContain("combobox");
    expect(html).not.toContain("viewport-select");
  });

  test("all groups is selected by default and has a linked content panel", () => {
    const html = render();
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*tabindex="0"/);
    expect(html).toMatch(/role="tabpanel"[^>]*aria-labelledby="[^"]*-tab-all"/);
    expect(html.match(/data-testid="tag-results"/g)).toHaveLength(1);
  });

  test("controls the selected subgroup without duplicating tag results", () => {
    const html = render("characters", "characters:genshin");
    expect(html).toMatch(/id="[^"]*-tab-characters:genshin"[^>]*aria-selected="true"/);
    expect(html).toMatch(/role="tabpanel"[^>]*aria-labelledby="[^"]*-tab-characters:genshin"/);
    expect(html.match(/data-testid="tag-results"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  });

  test("all categories keeps the existing results without subgroup navigation", () => {
    const html = render("all");
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain("子分组");
    expect(html).toContain("当前标签内容");
  });

  test("invalid subgroup selection falls back to all groups", () => {
    const html = render("characters", "body:hair");
    expect(html).toMatch(/role="tabpanel"[^>]*aria-labelledby="[^"]*-tab-all"/);
  });
});
