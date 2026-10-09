import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import {
  parseTagSource,
  stableId,
  transformTagSource,
} from "./parse-tag-source";
import { sourceCategories } from "./source-categories";

const source = readFileSync(
  new URL("../data/loadTags.js", import.meta.url),
  "utf8",
);
const images = readdirSync(
  new URL("../public/images/artist/", import.meta.url),
).filter((file) => file.endsWith(".webp"));
const data = transformTagSource(source, images);

describe("source import", () => {
  test("parses data literals without executing JavaScript", () => {
    expect(
      parseTagSource('const Tagjson={Category:{Group:{"中文":"english"}}}'),
    ).toEqual({ Category: { Group: { 中文: "english" } } });
    expect(() => parseTagSource("const Tagjson={a:process.exit()}")).toThrow();
    expect(() => parseTagSource("const Tagjson={...process.env}")).toThrow();
    expect(() => parseTagSource("const Tagjson={}; process.exit()")).toThrow();
    expect(() =>
      parseTagSource('const Tagjson={get a(){return "secret"}}'),
    ).toThrow();
  });
  test("uses the source site's category names and ordering", () => {
    expect(data.categories.map((category) => category.sourceKey)).toEqual(
      sourceCategories.map((category) => category.sourceKey),
    );
    expect(data.categories[0].nameZh).toBe("质量&控制");
    expect(data.categories.at(-2)?.nameZh).toBe("画师&画风");
  });
  test("preserves every source group and tag including blank Chinese labels", () => {
    const root = parseTagSource(source);
    let groups = 0,
      tags = 0;
    for (const category of Object.values(root)) {
      if (typeof category === "string") throw new Error("invalid category");
      groups += Object.keys(category).length;
      for (const group of Object.values(category)) {
        if (typeof group === "string") throw new Error("invalid group");
        tags += Object.keys(group).length;
      }
    }
    expect(data.groups.length).toBe(groups);
    expect(data.tags.length).toBe(tags);
    expect(data.tags.some((tag) => tag.rawZh.trim() === "")).toBe(true);
    expect(new Set(data.tags.map((tag) => tag.id)).size).toBe(data.tags.length);
    for (const tag of data.tags) {
      expect(
        data.groups.some(
          (group) =>
            group.id === tag.groupId && group.categoryId === tag.categoryId,
        ),
      ).toBe(true);
      expect(tag.rawEn.length).toBeGreaterThan(0);
    }
  });
  test("retains aliases, comments, and the raw bilingual source values", () => {
    const alias = data.tags.find((tag) => tag.rawZh.includes("|"))!;
    expect(alias.zh).toBe(alias.rawZh.split("|")[0].trim());
    expect(alias.aliases).toEqual(
      alias.rawZh
        .split("|")
        .slice(1)
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const note = data.tags.find((tag) => tag.rawEn.includes("//"))!;
    expect(note.note).toBeTruthy();
    expect(note.en).not.toContain("//");
    expect(note.rawEn).toContain("//");
  });
  test("matches every source artist to the supplied local webp images", () => {
    const artists = data.tags.filter((tag) => tag.categoryId === "illustrator");
    expect(artists.length).toBeGreaterThan(0);
    expect(data.missingImages).toEqual([]);
    for (const artist of artists) {
      expect(artist.imageUrl?.startsWith("/images/artist/")).toBe(true);
      expect(
        images.includes(
          decodeURIComponent(artist.imageUrl!.split("/").at(-1)!),
        ),
      ).toBe(true);
    }
  });
  test("uses deterministic ids; importer does not collapse equal English values", () => {
    expect(stableId("body", ["长发", "长发"])).toBe(
      stableId("body", ["长发", "长发"]),
    );
    const duplicate = data.tags.find(
      (tag, index) =>
        data.tags.findIndex((other) => other.en === tag.en) !== index,
    )!;
    const first = data.tags.find((tag) => tag.en === duplicate.en)!;
    expect(first.id).not.toBe(duplicate.id);
  });
});
