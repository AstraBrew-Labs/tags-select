import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { transformTagSource } from "../../scripts/parse-tag-source";
import { isCatalogResponse } from "./catalog-cache";
import { createTagCatalog, emptyCatalog } from "./tag-catalog";
import type { CatalogResponse, TagCategory } from "./catalog-types";

const source = readFileSync(
  new URL("../../data/loadTags.js", import.meta.url),
  "utf8",
);
const parsed = transformTagSource(
  source,
  readdirSync(new URL("../../public/images/artist/", import.meta.url)),
);
const response: CatalogResponse = {
  categories: parsed.categories.map((category) => ({
    ...category,
    id: category.id as TagCategory,
    count: parsed.tags.filter((tag) => tag.categoryId === category.id).length,
  })),
  groups: parsed.groups.map((group) => ({
    ...group,
    categoryId: group.categoryId as TagCategory,
    count: parsed.tags.filter((tag) => tag.groupId === group.id).length,
  })),
  tags: parsed.tags.map((tag) => ({
    ...tag,
    categoryId: tag.categoryId as TagCategory,
  })),
  source: null,
};
const catalog = createTagCatalog(response);
const longHair = catalog.tags.find(
  (tag) => tag.name.replace(/_/g, " ") === "long hair",
)!;
const girl = catalog.tags.find((tag) => tag.name === "1girl")!;
const solo = catalog.tags.find((tag) => tag.name === "solo")!;

describe("API catalog adapter", () => {
  test("the complete source catalog passes persistent-cache validation", () => {
    expect(isCatalogResponse(response)).toBe(true);
  });
  test("does not ship a static fallback collection", () => {
    expect(emptyCatalog.tags).toEqual([]);
    expect(emptyCatalog.categories).toEqual([]);
    expect(emptyCatalog.recipes).toEqual([]);
  });
  test("preserves all API bilingual values, hierarchy and counts", () => {
    expect(catalog.tags.length).toBe(response.tags.length);
    expect(
      catalog.categories.reduce((total, category) => total + category.count, 0),
    ).toBe(catalog.tags.length);
    for (const tag of response.tags) {
      const adapted = catalog.tagById.get(tag.id)!;
      expect(adapted.name).toBe(tag.en);
      expect(adapted.translation).toBe(tag.zh);
      expect(adapted.group).toBe(tag.groupId);
    }
  });
  test("searches Chinese, English, source aliases, and groups without result caps", () => {
    expect(
      catalog
        .filterTags({ query: "长发" })
        .some((tag) => tag.id === longHair.id),
    ).toBe(true);
    expect(
      catalog.filterTags({ query: "LONG_HAIR" }).map((tag) => tag.id),
    ).toEqual(catalog.filterTags({ query: "long hair" }).map((tag) => tag.id));
    for (const tag of response.tags.filter((tag) => tag.aliases.length))
      for (const alias of tag.aliases)
        expect(
          catalog.filterTags({ query: alias }).some((hit) => hit.id === tag.id),
        ).toBe(true);
    expect(
      catalog.filterTags({ category: "environment" }).length,
    ).toBeGreaterThan(50);
  });
  test("filters by real subgroups and favorites", () => {
    expect(
      catalog
        .filterTags({
          category: "body",
          group: longHair.group,
          favorites: [longHair.id, girl.id],
        })
        .map((tag) => tag.id),
    ).toEqual([longHair.id]);
    expect(catalog.filterTags({ favorites: [] })).toEqual([]);
  });
  test("migrates English-name and previous i18n-key favorites", () => {
    expect(
      catalog.normalizeTagIds([
        "long hair",
        "body.hairLength.longHair",
        longHair.id,
        "solo",
        "unknown",
      ]),
    ).toEqual([longHair.id, solo.id]);
  });
  test("copies underscore-normalized English rather than hashed ids or translations", () => {
    expect(
      catalog.formatPrompt([solo.id, girl.id, solo.id, longHair.id, "unknown"]),
    ).toBe("solo, 1girl, long_hair");
    expect(catalog.formatPrompt([])).toBe("");
    const composite = catalog.tags.find(
      (tag) => tag.category === "quality" && tag.name.includes(","),
    )!;
    expect(catalog.formatPrompt([composite.id])).toBe(
      composite.name.split(",").map((name) => name.trim().replace(/\s+/g, "_")).join(", "),
    );
    const mikoto = catalog.tags.find((tag) => tag.name === "misaka mikoto")!;
    expect(mikoto).toBeDefined();
    expect(catalog.formatPrompt([mikoto.id])).toBe("misaka_mikoto");
    expect(mikoto.name).toBe("misaka mikoto");
  });
  test("pasted prompts resolve through the complete real API dataset", () => {
    const result = catalog.lookupPrompt(
      "1girl, solo, {long_hair}, (smile:1.2), watercolor, unknown_tag, SOLO",
    );
    expect(result.total).toBe(7);
    expect(result.matched).toBe(5);
    expect(result.unmatched).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(
      result.items.find((item) => item.normalized === "long hair")?.matches[0]
        .tag.translation,
    ).toBe("长发");
    expect(
      catalog.lookupPrompt("artist:anmi").items[0].matches[0].tag.imageUrl,
    ).toBeTruthy();
    expect(
      catalog
        .lookupPrompt("best quality")
        .items[0].matches.every((match) => match.kind === "component"),
    ).toBe(true);
  });
  test("selected filtering combines with search/category, and weighting copies the real values", () => {
    expect(
      catalog
        .filterTags({ selected: [longHair.id, girl.id], category: "body" })
        .map((tag) => tag.id),
    ).toEqual([longHair.id]);
    expect(catalog.filterTags({ selected: [], category: "body" })).toEqual([]);
    expect(
      catalog.filterTags({ selected: [longHair.id], query: "smile" }),
    ).toEqual([]);
    const options = { weights: { [longHair.id]: 1, [girl.id]: -1 } };
    expect(catalog.formatPrompt([longHair.id, girl.id], options)).toBe(
      "{long_hair}, [1girl]",
    );
    expect(
      catalog.formatPrompt([longHair.id, girl.id], {
        ...options,
        syntax: "parentheses",
      }),
    ).toBe("(long_hair), [1girl]");
    expect(catalog.formatPrompt([longHair.id, girl.id])).toBe(
      "long_hair, 1girl",
    );
  });
  test("all recipe ids resolve to database/API records", () => {
    expect(catalog.recipes.length).toBe(3);
    for (const recipe of catalog.recipes) {
      expect(recipe.ids.length).toBeGreaterThan(0);
      for (const id of recipe.ids) expect(catalog.tagById.has(id)).toBe(true);
    }
  });
});
