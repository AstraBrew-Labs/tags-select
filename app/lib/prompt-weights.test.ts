import { describe, expect, test } from "bun:test";
import {
  clampWeightStep,
  formatWeightedPrompt,
  formatWeightedTag,
  MAX_WEIGHT_STEP,
  MIN_WEIGHT_STEP,
  adjustPromptWeights,
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
  test("symbol switching means curly vs round brackets, never a numeric output", () => {
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
  test("bounds repeated clicks and ignores non-finite state", () => {
    expect(clampWeightStep(999)).toBe(MAX_WEIGHT_STEP);
    expect(clampWeightStep(-999)).toBe(MIN_WEIGHT_STEP);
    expect(clampWeightStep(1.9)).toBe(1);
    expect(clampWeightStep(NaN)).toBe(0);
    expect(clampWeightStep(Infinity)).toBe(0);
  });
  test("switching syntax or returning a step to zero does not alter source values/order", () => {
    const entries = [
      { name: "1girl", step: 0 },
      { name: "long hair", step: 2 },
      { name: "solo", step: -1 },
    ];
    expect(formatWeightedPrompt(entries)).toBe("1girl, {{long hair}}, [solo]");
    expect(formatWeightedPrompt(entries, "parentheses")).toBe(
      "1girl, ((long hair)), [solo]",
    );
    expect(formatWeightedPrompt(entries)).toBe("1girl, {{long hair}}, [solo]");
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
    ).toBe("{best quality, amazing quality}");
  });
  test("the lookup feature recognizes both weighted output formats including comma groups", () => {
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
    for (const syntax of ["brackets", "parentheses"] as const) {
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
