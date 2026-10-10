import { describe, expect, test } from "bun:test";
import { preparePromptSearch, preprocessPromptQuery, PROMPT_SEARCH_MAX_LENGTH } from "./prompt-preprocessing";

describe("plain-tag search preprocessing", () => {
  test("strips nested emphasis, signed numeric weights and comma-weight groups", () => {
    expect(preprocessPromptQuery(
      "{misaka_mikoto}, {best quality, very aesthetic, year 2024, absurdres,masterpiece}, " +
      "-2::artist:collaboration::, {rinzawa}, [funii], myusha, gomano_rio, gomano rio, " +
      "0.7::jyt::, 0.5::karyln::, {artist:mignon}, han_(hehuihuihui), " +
      "{chen_bin, shenmi_de_xigua,jiuchong_ying_fengxue}, 0.7::red hair::, " +
      "{{standing split}}, {spread legs, parted legs}, -2::green hair::",
    )).toBe(
      "misaka_mikoto, best quality, very aesthetic, year 2024, absurdres, masterpiece, " +
      "artist:collaboration, rinzawa, funii, myusha, gomano_rio, jyt, karyln, artist:mignon, " +
      "han_(hehuihuihui), chen_bin, shenmi_de_xigua, jiuchong_ying_fengxue, red hair, " +
      "standing split, spread legs, parted legs, green hair",
    );
  });
  test("keeps name parentheses, colons, numeric tags and source spelling intact", () => {
    expect(preprocessPromptQuery(
      "{artist:mignon}, han_(hehuihuihui), artist:bow (bhp), character (series, edition), 1girl, year 2024",
    )).toBe(
      "artist:mignon, han_(hehuihuihui), artist:bow (bhp), character (series, edition), 1girl, year 2024",
    );
  });
  test("handles nested numeric and Stable Diffusion parentheses weights", () => {
    expect(preprocessPromptQuery(
      "0.7::{long_hair, ((smile:1.2))}::, +.5::[portrait]::, ((blue_dress:0.8)), [.2::forest::]",
    )).toBe("long_hair, smile, portrait, blue_dress, forest");
  });
  test("combines repeated terms without renaming the first tag or dropping negatively weighted tags", () => {
    expect(preprocessPromptQuery("{LONG_HAIR}, long hair, long_hair, -2::green hair::, [green_hair]"))
      .toBe("LONG_HAIR, green hair");
    expect(preprocessPromptQuery("1girl， solo,\nred hair,\r\n,,")).toBe("1girl, solo, red hair");
  });
  test("does not translate, correct singular names or rewrite natural language descriptions", () => {
    expect(preprocessPromptQuery("green eye, pubic, no panty")).toBe("green eye, pubic, no panty");
    expect(preprocessPromptQuery(" 一个穿着白色水手服的少女在雨中奔跑 ")).toBe("一个穿着白色水手服的少女在雨中奔跑");
    expect(preprocessPromptQuery("白色水手服（夏季款）")).toBe("白色水手服（夏季款）");
  });
  test("cleaning is idempotent", () => {
    const raw = "{misaka_mikoto}, -2::artist:collaboration::, han_(hehuihuihui), (long hair:1.2)";
    const clean = preprocessPromptQuery(raw);
    expect(preprocessPromptQuery(clean)).toBe(clean);
  });
  test("keeps internal-name commas in the same batch, and includes every term once", () => {
    const terms = Array.from({ length: 70 }, (_, index) => `artist_${index} (series, edition)`);
    const prepared = preparePromptSearch(terms.map((tag) => `{${tag}}`).join(", "));
    expect(prepared.queries.length).toBeGreaterThan(1);
    expect(prepared.queries.every((query) => query.length <= 300)).toBe(true);
    expect(prepared.queries.join(", ")).toBe(terms.join(", "));
  });
  test("invalid, empty, overlong single tag and too many batches fail without truncation", () => {
    expect(() => preparePromptSearch("{}, []")).toThrow("没有有效");
    expect(() => preparePromptSearch("x".repeat(301))).toThrow("单个标签");
    expect(() => preparePromptSearch("x".repeat(PROMPT_SEARCH_MAX_LENGTH + 1))).toThrow("最多支持");
    expect(() => preparePromptSearch(
      Array.from({ length: 13 }, (_, index) => `${index}_${"x".repeat(290)}`).join(", "),
    )).toThrow("12 批");
    expect(preparePromptSearch("{long hair}").queries).toEqual(["long hair"]);
  });
});
