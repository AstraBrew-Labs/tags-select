import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import TagFilterBar, { effectiveTagFilter } from "./tag-filter-bar";

describe("selected-only filter", () => {
  test("hidden until at least one tag is selected", () => {
    const render = (count: number) =>
      renderToStaticMarkup(
        <TagFilterBar value="all" selectedCount={count} onChange={() => {}} />,
      );
    expect(render(0)).not.toContain("已选择");
    expect(render(1)).toContain("已选择 1");
    expect(render(2)).toContain("已选择 2");
    expect(render(1).indexOf("已选择")).toBeGreaterThan(
      render(1).indexOf("常用推荐"),
    );
  });
  test("no selected tags falls back to all instead of leaving an invisible active filter", () => {
    expect(effectiveTagFilter("selected", 0)).toBe("all");
    expect(effectiveTagFilter("selected", 1)).toBe("selected");
    expect(effectiveTagFilter("popular", 0)).toBe("popular");
  });
});

describe("favorites in the filter row", () => {
  function render(
    selectedCount: number,
    favoritesCount: number,
    value: "all" | "favorites" = "all",
  ) {
    return renderToStaticMarkup(
      <TagFilterBar
        value={value}
        selectedCount={selectedCount}
        favoritesCount={favoritesCount}
        onChange={() => {}}
      />,
    );
  }
  test("appears only with favorites and stays to the right of selected/recommended", () => {
    expect(render(0, 0)).not.toContain("我的收藏");
    expect(render(1, 0)).not.toContain("我的收藏");
    expect(render(0, 1)).toContain("我的收藏 1");
    const html = render(2, 3);
    expect(html).toContain("已选择 2");
    expect(html).toContain("我的收藏 3");
    expect(html.indexOf("我的收藏")).toBeGreaterThan(html.indexOf("已选择"));
    expect(html.indexOf("我的收藏")).toBeGreaterThan(html.indexOf("常用推荐"));
  });
  test("falls back to all when the last favorite is removed", () => {
    expect(effectiveTagFilter("favorites", 0, 0)).toBe("all");
    expect(effectiveTagFilter("favorites", 2, 0)).toBe("all");
    expect(effectiveTagFilter("favorites", 0, 1)).toBe("favorites");
    expect(effectiveTagFilter("selected", 1, 0)).toBe("selected");
    expect(render(1, 0, "favorites")).not.toContain("我的收藏");
  });
});
