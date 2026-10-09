import { describe, expect, test } from "bun:test";
import { createPromptLookup, parsePromptTokens } from "./prompt-lookup";
import type { NovelTag } from "./tag-catalog";

function tag(
  id: string,
  name: string,
  translation = "",
  aliases: string[] = [],
): NovelTag {
  return {
    id,
    name,
    translation,
    aliases,
    category: "body",
    group: "body:group",
    popular: false,
  };
}
const tags = [
  tag("girl", "1girl", "一个女孩"),
  tag("solo", "solo", "单人"),
  tag("long-hair", "long hair", "长发", ["长头发"]),
  tag("smile", "smile", "微笑"),
  tag("portrait", "portrait", "人像"),
  tag(
    "quality",
    "best quality, amazing quality, very aesthetic, absurdres",
    "最高画质",
  ),
  tag("artist", "artist:bow (bhp)", "BOW"),
  tag("internal-comma", "character (series, edition)", "角色"),
  tag("watercolor", "watercolor", "水彩"),
  tag("duplicate", "watercolor", "另一分类的水彩"),
  tag("weight-name", "(symbol)", "符号"),
];
const lookup = createPromptLookup(tags);

describe("pasted prompt lookup", () => {
  test("handles commas, Chinese commas, newlines and blank separators", () => {
    expect(
      parsePromptTokens("1girl， solo,\n\r, long hair,,").map(
        (item) => item.term,
      ),
    ).toEqual(["1girl", "solo", "long hair"]);
    expect(lookup(" ").items).toEqual([]);
    expect(lookup(",\n,，").total).toBe(0);
  });
  test("unwraps NovelAI and numeric-weight groups including multiple nested tags", () => {
    const result = lookup(
      "{{1girl}}, [solo], {long hair, smile}, (portrait:1.2)",
    );
    expect(result.matched).toBe(5);
    expect(result.unmatched).toBe(0);
    expect(result.items.map((item) => item.term)).toEqual([
      "1girl",
      "solo",
      "long hair",
      "smile",
      "portrait",
    ]);
    expect(lookup("((smile:1.2)), (1girl, solo:0.8)").matched).toBe(3);
  });
  test("preserves punctuation and parentheses within artist and character names", () => {
    const result = lookup(
      "artist:bow (bhp), character (series, edition), (symbol)",
    );
    expect(result.total).toBe(3);
    expect(result.items.map((item) => item.matches[0].tag.id)).toEqual([
      "artist",
      "internal-comma",
      "weight-name",
    ]);
  });
  test("matches exact English, Chinese and aliases with case/underscore normalization", () => {
    expect(
      lookup("LONG_HAIR, 长头发, 微笑").items.map(
        (item) => item.matches[0].tag.id,
      ),
    ).toEqual(["long-hair", "long-hair", "smile"]);
  });
  test("collapses repeated normalized terms in original order, preserving counts", () => {
    const result = lookup("smile, {SMILE}, long_hair, long hair");
    expect(result.total).toBe(4);
    expect(result.duplicates).toBe(2);
    expect(result.items.map((item) => item.occurrences)).toEqual([2, 2]);
    expect(result.items.map((item) => item.term)).toEqual([
      "smile",
      "long_hair",
    ]);
  });
  test("unknown terms remain unmatched, without fuzzy guesses or invented translations", () => {
    const result = lookup("smil, missing_tag, smile");
    expect(result.matched).toBe(1);
    expect(result.unmatched).toBe(2);
    expect(result.items[0].matches).toEqual([]);
  });
  test("reports multiple exact source matches rather than silently picking one", () => {
    expect(
      lookup("watercolor").items[0].matches.map((match) => match.tag.id),
    ).toEqual(["watercolor", "duplicate"]);
  });
  test("labels compound-only matches and keeps their full source values", () => {
    const item = lookup("best quality").items[0];
    expect(item.matches[0].kind).toBe("component");
    expect(item.matches[0].tag.name).toBe(
      "best quality, amazing quality, very aesthetic, absurdres",
    );
    expect(lookup("best quality, amazing quality").matched).toBe(2);
  });
  test("an exact standalone tag takes precedence over compound matches", () => {
    const resolve = createPromptLookup([
      ...tags,
      tag("direct-quality", "best quality", "最佳质量"),
    ]);
    expect(
      resolve("best quality").items[0].matches.map((match) => match.tag.id),
    ).toEqual(["direct-quality"]);
    expect(resolve("best quality").items[0].matches[0].kind).toBe("exact");
  });
});
