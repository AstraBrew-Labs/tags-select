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
