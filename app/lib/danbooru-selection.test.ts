import { describe, expect, test } from "bun:test";
import { danbooruFixture } from "./danbooru-fixtures.test";
import { DANBOORU_RECOMMENDATION_TAG_LIMIT } from "./danbooru-types";
import {
  createDanbooruRecommendationSelection,
  filterDanbooruSelection,
  getDanbooruSelectionInput,
  toggleDanbooruSelection,
  type DanbooruSelection,
} from "./danbooru-selection";

const first = danbooruFixture.results[0];
const second = {
  ...first,
  tag: "another_character",
  cn_name: "另一个角色",
  category: "Character",
};

describe("cross-search recommendation selection", () => {
  const sameCategory = {
    tag: "white_sailor_collar",
    cn_name: "白色水手领",
    category: "General",
    sources: [first.tag],
    wiki: "说明",
  };

  test("adds same-category metadata to the same combined query as search results", () => {
    const selection = createDanbooruRecommendationSelection(sameCategory, false);
    const selected = toggleDanbooruSelection(toggleDanbooruSelection([], first), selection);
    expect(selected[1]).toEqual({
      tag: sameCategory.tag, cn_name: sameCategory.cn_name, category: "General", nsfw: "0",
    });
    expect(getDanbooruSelectionInput(selected, false)).toEqual({
      tags: [first.tag, sameCategory.tag], categories: ["General"], show_nsfw: false,
    });
    expect(filterDanbooruSelection(selected, false)).toBe(selected);
    expect(selected[1]).not.toHaveProperty("sources");
  });

  test("same-category and search results share identity and never duplicate selections", () => {
    const original = toggleDanbooruSelection([], first);
    const rediscovered = createDanbooruRecommendationSelection({
      ...sameCategory, tag: first.tag, cn_name: "推荐中的同一标签",
    }, false);
    expect(toggleDanbooruSelection(original, rediscovered)).toEqual([]);
  });

  test("adult-mode same-category selections with unknown safety are removed when switching off", () => {
    const choice = createDanbooruRecommendationSelection(sameCategory, true);
    expect(choice.nsfw).toBe("unknown");
    const selected = toggleDanbooruSelection(toggleDanbooruSelection([], first), choice);
    expect(getDanbooruSelectionInput(selected, true).tags).toEqual([first.tag, sameCategory.tag]);
    expect(filterDanbooruSelection(selected, false).map((item) => item.tag)).toEqual([first.tag]);
  });

  test("combines names and categories from different search responses", () => {
    let selected = toggleDanbooruSelection([], first);
    // Selecting from a new search adds to, not replaces, the old response.
    selected = toggleDanbooruSelection(selected, second);
    expect(selected.map((item) => item.cn_name)).toEqual([first.cn_name, second.cn_name]);
    expect(getDanbooruSelectionInput(selected, false)).toEqual({
      tags: ["white_serafuku", "another_character"],
      categories: ["General", "Character"],
      show_nsfw: false,
    });
    expect(selected[0]).not.toHaveProperty("wiki");
    expect(selected[0]).not.toBe(first);
  });

  test("deselects by tag identity when rediscovered under another query", () => {
    const selected = toggleDanbooruSelection(toggleDanbooruSelection([], first), second);
    const remaining = toggleDanbooruSelection(selected, { ...first, cn_name: "另一种译名" });
    expect(remaining.map((item) => item.tag)).toEqual([second.tag]);
    expect(selected).toHaveLength(2);
  });

  test("deduplicates categories while including every selected tag", () => {
    const selected = toggleDanbooruSelection(
      toggleDanbooruSelection([], first),
      { ...second, category: "General" },
    );
    expect(getDanbooruSelectionInput(selected, false).categories).toEqual(["General"]);
    expect(getDanbooruSelectionInput(selected, false).tags).toHaveLength(2);
  });

  test("reaching the limit never silently replaces earlier choices", () => {
    let selected: readonly DanbooruSelection[] = [];
    for (let index = 0; index < DANBOORU_RECOMMENDATION_TAG_LIMIT; index++) {
      selected = toggleDanbooruSelection(selected, { ...first, tag: `tag_${index}` });
    }
    expect(toggleDanbooruSelection(selected, second)).toBe(selected);
    const reduced = toggleDanbooruSelection(selected, { ...first, tag: "tag_0" });
    const added = toggleDanbooruSelection(reduced, second);
    expect(added).toHaveLength(DANBOORU_RECOMMENDATION_TAG_LIMIT);
    expect(added.at(-1)?.tag).toBe(second.tag);
    expect(added[0].tag).toBe("tag_1");
  });

  test("safe mode filters adult selections from older queries, not only current results", () => {
    const adult = { ...second, nsfw: "1" };
    const selected = toggleDanbooruSelection(toggleDanbooruSelection([], first), adult);
    expect(filterDanbooruSelection(selected, true)).toBe(selected);
    const safe = filterDanbooruSelection(selected, false);
    expect(safe).toEqual([{ tag: first.tag, cn_name: first.cn_name, category: first.category, nsfw: "0" }]);
    expect(getDanbooruSelectionInput(selected, false)).toEqual({
      tags: [first.tag],
      categories: ["General"],
      show_nsfw: false,
    });
    expect(getDanbooruSelectionInput(selected, true).tags).toEqual([first.tag, adult.tag]);
    expect(filterDanbooruSelection(safe, true)).toEqual(safe);
  });

  test("all-adult selection becomes empty in safe mode; safe choices keep identity", () => {
    const adult = toggleDanbooruSelection([], { ...first, nsfw: "unknown" });
    expect(filterDanbooruSelection(adult, false)).toEqual([]);
    expect(getDanbooruSelectionInput(adult, false).tags).toEqual([]);
    const safe = toggleDanbooruSelection([], first);
    expect(filterDanbooruSelection(safe, false)).toBe(safe);
  });
});
