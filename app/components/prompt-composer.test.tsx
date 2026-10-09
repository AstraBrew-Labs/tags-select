import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import PromptComposer, { type PromptComposerProps } from "./prompt-composer";
import type { NovelTag } from "../lib/tag-catalog";
const tag: NovelTag = {
  id: "hair",
  name: "long hair",
  translation: "长发",
  category: "body",
  group: "g",
  aliases: [],
  popular: false,
};
const noop = () => {};
function render(options: Partial<PromptComposerProps> = {}) {
  return renderToStaticMarkup(
    <PromptComposer
      tags={[tag]}
      weights={{ hair: 1 }}
      syntax="brackets"
      prompt="{long hair}"
      onAdjust={noop}
      onReset={noop}
      onRemove={noop}
      onAdjustAll={noop}
      onResetAll={noop}
      onSwitchSyntax={noop}
      onClear={noop}
      onCopy={noop}
      {...options}
    />,
  );
}

describe("wide top prompt composer", () => {
  test("groups horizontal tokens, preview, copy and batch actions in one section", () => {
    const html = render();
    for (const content of [
      "prompt-composer",
      "prompt-token-list",
      "全部减权",
      "全部加权",
      "重置权重",
      "复制提示词",
      "提示词预览",
    ])
      expect(html).toContain(content);
    expect(html).not.toContain("prompt-sidebar");
    expect(html).not.toContain("selected-prompt-controls");
  });
  test("switch has only curly/round bracket labels and retains weights", () => {
    const curly = render();
    const round = render({ syntax: "parentheses", prompt: "(long hair)" });
    expect(curly).toContain("{ }");
    expect(round).toContain("( )");
    expect(round).toContain("(long hair)");
    expect(curly).not.toContain("数值");
    expect(round).not.toContain("::");
  });
  test("empty composer disables copy, clear and batch weighting", () => {
    const html = render({ tags: [], weights: {}, prompt: "" });
    expect(html).toContain("还没有选词");
    expect(html.match(/ disabled=""/g)?.length).toBe(5);
    expect(html).not.toContain("selected-prompt-item");
  });
});
