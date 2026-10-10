import { describe, expect, test } from "bun:test";
import {
  clampWeightStep,
  formatWeightedPrompt,
  formatWeightedTag,
  MAX_WEIGHT_STEP,
  MIN_WEIGHT_STEP,
  adjustPromptWeights,
  nextWeightSyntax,
  normalizePromptTagName,
} from "./prompt-weights";
import { createPromptLookup } from "./prompt-lookup";

describe("selected prompt weights", () => {
  test("default weights leave the complete source prompt untouched", () => {
    expect(formatWeightedTag("long hair")).toBe("long hair");
    expect(
      formatWeightedTag("best quality, amazing quality", 0, "parentheses"),
    ).toBe("best quality, amazing quality");
  });
  test("positive and negative steps add matching nested braces or square brackets", () => {
    expect(formatWeightedTag("long hair", 1)).toBe("{long hair}");
    expect(formatWeightedTag("long hair", 2)).toBe("{{long hair}}");
    expect(formatWeightedTag("long hair", -1)).toBe("[long hair]");
    expect(formatWeightedTag("long hair", -2)).toBe("[[long hair]]");
    expect(formatWeightedTag("{bad}", -1)).toBe("[{bad}]");
  });
  test("round bracket format retains its existing output", () => {
    expect(formatWeightedTag("long hair", 1, "parentheses")).toBe(
      "(long hair)",
    );
    expect(formatWeightedTag("long hair", 2, "parentheses")).toBe(
      "((long hair))",
    );
    expect(formatWeightedTag("long hair", -1, "parentheses")).toBe(
      "[long hair]",
    );
    expect(formatWeightedTag("long hair", -2, "parentheses")).toBe(
      "[[long hair]]",
    );
  });
  test("cycles all three formats and returns to the initial format", () => {
    expect(nextWeightSyntax("brackets")).toBe("parentheses");
    expect(nextWeightSyntax("parentheses")).toBe("novelai");
    expect(nextWeightSyntax("novelai")).toBe("brackets");
  });
  test("NovelAI numeric format supports positive, negative, zero and bounded weights", () => {
    expect(formatWeightedTag("long hair", 1, "novelai")).toBe("1.05::long hair::");
    expect(formatWeightedTag("long hair", 2, "novelai")).toBe("1.103::long hair::");
    expect(formatWeightedTag("long hair", -1, "novelai")).toBe("0.952::long hair::");
    expect(formatWeightedTag("long hair", -2, "novelai")).toBe("0.907::long hair::");
    expect(formatWeightedTag("long hair", 0, "novelai")).toBe("long hair");
    expect(formatWeightedTag("long hair", 999, "novelai")).toBe("2.653::long hair::");
    expect(formatWeightedTag("long hair", -999, "novelai")).toBe("0.377::long hair::");
    expect(formatWeightedTag("long hair", NaN, "novelai")).toBe("long hair");
    expect(formatWeightedPrompt([
      { name: "best quality, amazing quality", step: 1 },
      { name: "best quality, amazing quality", step: -1 },
    ], "novelai")).toBe("1.05::best_quality, amazing_quality::");
  });
  test("bounds repeated clicks and ignores non-finite state", () => {
    expect(clampWeightStep(999)).toBe(MAX_WEIGHT_STEP);
    expect(clampWeightStep(-999)).toBe(MIN_WEIGHT_STEP);
    expect(clampWeightStep(1.9)).toBe(1);
    expect(clampWeightStep(NaN)).toBe(0);
    expect(clampWeightStep(Infinity)).toBe(0);
  });
  test("switching syntax keeps normalized output names and source order", () => {
    const entries = [
      { name: "1girl", step: 0 },
      { name: "long hair", step: 2 },
      { name: "solo", step: -1 },
    ];
    expect(formatWeightedPrompt(entries)).toBe("1girl, {{long_hair}}, [solo]");
    expect(formatWeightedPrompt(entries, "parentheses")).toBe(
      "1girl, ((long_hair)), [solo]",
    );
    expect(formatWeightedPrompt(entries, "novelai")).toBe("1girl, 1.103::long_hair::, 0.952::solo::");
    expect(formatWeightedPrompt(entries)).toBe("1girl, {{long_hair}}, [solo]");
    expect(formatWeightedTag("long hair", 0)).toBe("long hair");
  });
  test("batch adjustments apply once to each selected token and respect limits", () => {
    expect(
      adjustPromptWeights(
        ["hair", "solo"],
        { hair: 1, solo: -1, removed: 10 },
        1,
      ),
    ).toEqual({ hair: 2, solo: 0 });
    expect(
      adjustPromptWeights(
        ["hair", "solo"],
        { hair: MAX_WEIGHT_STEP, solo: MIN_WEIGHT_STEP },
        -1,
      ),
    ).toEqual({ hair: MAX_WEIGHT_STEP - 1, solo: MIN_WEIGHT_STEP });
    expect(adjustPromptWeights([], { removed: 10 }, 1)).toEqual({});
  });
  test("composite prompts are weighted as a whole and duplicate source values keep the first", () => {
    expect(
      formatWeightedPrompt([
        { name: "best quality, amazing quality", step: 1 },
        { name: "best quality, amazing quality", step: -1 },
      ]),
    ).toBe("{best_quality, amazing_quality}");
  });
  test("normalizes character names, repeated whitespace and composite tags only on output", () => {
    expect(normalizePromptTagName("misaka mikoto")).toBe("misaka_mikoto");
    expect(normalizePromptTagName("  misaka   mikoto\t")).toBe("misaka_mikoto");
    expect(normalizePromptTagName("misaka_mikoto")).toBe("misaka_mikoto");
    expect(normalizePromptTagName("misaka mikoto, long hair,artist:john smith")).toBe(
      "misaka_mikoto, long_hair, artist:john_smith",
    );
    expect(normalizePromptTagName("saber (fate/stay night)")).toBe("saber_(fate/stay_night)");
    expect(normalizePromptTagName("artist:anmi, 1girl")).toBe("artist:anmi, 1girl");
    const entries = [{ name: "misaka mikoto", step: 1 }];
    expect(formatWeightedPrompt(entries)).toBe("{misaka_mikoto}");
    expect(formatWeightedPrompt(entries, "parentheses")).toBe("(misaka_mikoto)");
    expect(formatWeightedPrompt(entries, "novelai")).toBe("1.05::misaka_mikoto::");
    expect(formatWeightedPrompt([{ name: "misaka mikoto", step: -1 }], "novelai")).toBe(
      "0.952::misaka_mikoto::",
    );
    expect(entries[0].name).toBe("misaka mikoto");
    expect(formatWeightedTag(entries[0].name, 1)).toBe("{misaka mikoto}");
  });
  test("deduplicates space and underscore variants using the first selected weight", () => {
    expect(formatWeightedPrompt([
      { name: "misaka mikoto", step: 1 },
      { name: "misaka_mikoto", step: -1 },
    ])).toBe("{misaka_mikoto}");
  });
  test("the lookup feature recognizes all three weighted formats including comma groups", () => {
    const lookup = createPromptLookup([
      {
        id: "hair",
        name: "long hair",
        translation: "长发",
        category: "body",
        group: "g",
        aliases: [],
        popular: false,
      },
      {
        id: "quality",
        name: "best quality, amazing quality",
        translation: "画质",
        category: "quality",
        group: "q",
        aliases: [],
        popular: false,
      },
    ]);
    for (const syntax of ["brackets", "parentheses", "novelai"] as const) {
      const prompt = formatWeightedPrompt(
        [
          { name: "long hair", step: 2 },
          { name: "best quality, amazing quality", step: -1 },
        ],
        syntax,
      );
      const result = lookup(prompt);
      expect(result.total).toBe(3);
      expect(result.matched).toBe(3);
      expect(result.unmatched).toBe(0);
    }
  });
});
