import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import snapshot from "../../data/adult-codex.json";
import { AdultCodexPanel, INITIAL_ADULT_CODEX_VIEW } from "./adult-codex";
import { isAdultCodexCatalog, type AdultCodexCatalog } from "../lib/adult-codex";

const data = snapshot as AdultCodexCatalog;

function render(options: {
  query?: string;
  categoryId?: string;
  volumeId?: string;
  page?: number;
} = {}) {
  return renderToStaticMarkup(
    <AdultCodexPanel
      data={data}
      loading={false}
      error={null}
      retry={() => {}}
      view={{
        ...INITIAL_ADULT_CODEX_VIEW,
        query: options.query ?? "",
        categoryId: options.categoryId ?? "all",
        volumeId: options.volumeId ?? "all",
        page: options.page ?? 1,
      }}
      onViewChange={() => {}}
      onLookup={() => {}}
    />,
  );
}

describe("adult codex catalog and layout", () => {
  test("validates the captured two-volume snapshot", () => {
    expect(isAdultCodexCatalog(snapshot)).toBe(true);
    expect(data.volumes.map((volume) => volume.label)).toEqual(["上卷", "下卷"]);
    expect(data.entries.length).toBeGreaterThan(9000);
    expect(data.entries.every((entry) => entry.groups.length > 0)).toBe(true);
  });

  test("shows searchable title cards and copy actions", () => {
    const html = render({ query: "missionary" });
    expect(html).toContain("所长的成人法典");
    expect(html).toContain("一般所长");
    expect(html).toContain("18+");
    expect(html).toContain("复制全部");
    expect(html).toContain("查找组内标签");
    expect(html).toContain("原始提示词");
    expect(html).toContain("原文");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<iframe");
  });

  test("chapter filters and pagination keep the same personal-codex layout", () => {
    const category = data.categories.find((item) => item.count > 10)!;
    const html = render({ categoryId: category.id, volumeId: category.volumeId });
    expect(html).toContain(category.title);
    expect(html).toContain('aria-label="成人法典标签组"');

    const pageTwo = render({ page: 2 });
    expect(pageTwo).toContain('aria-label="分页"');
  });
});
