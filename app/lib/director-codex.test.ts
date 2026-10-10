import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { codexFixture } from "./codex-fixtures.test";
import { codexSourceLink, createCodexIndex, isCodexCatalog } from "./director-codex";
import { isGeneralCodexContent } from "../../scripts/parse-codex-source";

describe("director codex catalog", () => {
  test("validates hierarchy, counts, unique identities, groups and provenance", () => {
    expect(isCodexCatalog(codexFixture)).toBe(true);
    for (const invalid of [
      null, {}, { ...codexFixture, version: 2 },
      { ...codexFixture, categories: [{ ...codexFixture.categories[0], count: 9 }] },
      { ...codexFixture, entries: [...codexFixture.entries, codexFixture.entries[0]] },
      { ...codexFixture, entries: [{ ...codexFixture.entries[0], categoryId: "missing" }] },
      { ...codexFixture, entries: [{ ...codexFixture.entries[0], groups: [] }] },
      { ...codexFixture, source: { ...codexFixture.source, url: "javascript:alert(1)" } },
      { ...codexFixture, source: { ...codexFixture.source, capturedAt: "not-a-date" } },
    ]) expect(isCodexCatalog(invalid)).toBe(false);
  });
  test("searches titles, tag groups, notes and chapter names without changing prompts", () => {
    const index = createCodexIndex(codexFixture);
    expect(index.filter("水彩")[0].id).toBe("watercolor");
    expect(index.filter("WATERCOLOR LINEART")[0].id).toBe("watercolor");
    expect(index.filter("额外画风")[0].id).toBe("watercolor");
    expect(index.filter("各种风格")[0].id).toBe("watercolor");
    expect(index.filter("winter coat")[0].id).toBe("coat");
    expect(index.filter("winter", "style")).toEqual([]);
    expect(index.filter("", "winter")).toHaveLength(1);
    expect(index.filter("no-match")).toEqual([]);
    expect(codexFixture.entries[0].groups[0].prompt).toContain("0.7::lineart::");
  });
  test("links to encoded original anchors on the fixed source site", () => {
    expect(codexSourceLink("冬装/一")).toEndWith("#%E5%86%AC%E8%A3%85%2F%E4%B8%80");
  });
  test("the checked-in source has valid counts and contains only reviewed general-purpose content", () => {
    const data = JSON.parse(readFileSync(new URL("../../data/director-codex.json", import.meta.url), "utf8"));
    expect(isCodexCatalog(data)).toBe(true);
    expect(data.entries.length).toBeGreaterThan(4000);
    const categoryNames = new Map(data.categories.map((item: { id: string; title: string }) => [item.id, item.title]));
    for (const entry of data.entries) {
      expect(isGeneralCodexContent([
        categoryNames.get(entry.categoryId), entry.title,
        ...entry.groups.flatMap((group: { label: string; prompt: string }) => [group.label, group.prompt]),
        ...entry.notes,
      ].join("\n"))).toBe(true);
    }
  });
});
