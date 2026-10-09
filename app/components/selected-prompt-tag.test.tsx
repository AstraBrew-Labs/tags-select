import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import SelectedPromptTag from "./selected-prompt-tag";
import {
  MIN_WEIGHT_STEP,
  MAX_WEIGHT_STEP,
  type WeightSyntax,
} from "../lib/prompt-weights";
const tag = {
  id: "hair",
  name: "long hair",
  translation: "长发",
  category: "body" as const,
  group: "g",
  aliases: [],
  popular: false,
};
function render(step: number, syntax: WeightSyntax = "brackets") {
  return renderToStaticMarkup(
    <SelectedPromptTag
      tag={tag}
      step={step}
      syntax={syntax}
      onAdjust={() => {}}
      onReset={() => {}}
      onRemove={() => {}}
    />,
  );
}

describe("per-tag weight controls", () => {
  test("offers accessible decrease/increase/reset/remove controls", () => {
    const html = render(0);
    for (const text of [
      'aria-label="long hair 减权"',
      'aria-label="long hair 加权"',
      'aria-label="long hair 重置权重"',
      'aria-label="移除 long hair"',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain("selected-prompt-controls");
    expect(html).toContain("prompt-token-label");
  });
  test("shows the selected bracket format inline without numeric factors", () => {
    expect(render(1)).toContain("{long hair} · 点击恢复默认权重");
    expect(render(1, "parentheses")).toContain(
      "(long hair) · 点击恢复默认权重",
    );
    expect(render(-1, "parentheses")).toContain("[long hair]");
    expect(render(1)).not.toContain("::");
  });
  test("disables the button at each supported weight boundary", () => {
    expect(render(MAX_WEIGHT_STEP)).toMatch(
      /disabled=""[^>]*aria-label="long hair 加权"|aria-label="long hair 加权"[^>]*disabled=""/,
    );
    expect(render(MIN_WEIGHT_STEP)).toMatch(
      /disabled=""[^>]*aria-label="long hair 减权"|aria-label="long hair 减权"[^>]*disabled=""/,
    );
  });
});
