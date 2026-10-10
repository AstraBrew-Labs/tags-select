import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import ViewportSelect from "./viewport-select";

describe("library Select geometry adapter", () => {
  test("keeps the controlled Select, its label and accessible combobox", () => {
    const html = renderToStaticMarkup(
      <ViewportSelect
        options={[
          { key: "recommended", label: "推荐排序" },
          { key: "alphabetical", label: "字母排序" },
        ]}
        value="alphabetical"
        onChange={() => {}}
        aria-label="标签排序"
      />,
    );
    expect(html).toContain('class="viewport-select"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="标签排序"');
    expect(html).toContain("字母排序");
    expect(html).toContain('data-menu-open="false"');
  });
  test("preserves disabled state without inventing library props", () => {
    const html = renderToStaticMarkup(
      <ViewportSelect
        options={[]}
        value=""
        onChange={() => {}}
        disabled
        aria-label="禁用选择器"
      />,
    );
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
  });
});
