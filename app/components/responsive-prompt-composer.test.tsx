import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import ResponsivePromptComposer from "./responsive-prompt-composer";
import type { PromptComposerProps } from "./prompt-composer";

const noop = () => {};
const props: PromptComposerProps = {
  tags: [],
  weights: {},
  syntax: "brackets",
  prompt: "",
  onAdjust: noop,
  onReset: noop,
  onRemove: noop,
  onAdjustAll: noop,
  onResetAll: noop,
  onSwitchSyntax: noop,
  onClear: noop,
  onCopy: noop,
};

describe("responsive prompt composer", () => {
  test("server renders the desktop fallback without browser APIs or drawer portals", () => {
    const html = renderToStaticMarkup(<ResponsivePromptComposer {...props} />);
    expect(html).toContain('class="desktop-prompt-composer"');
    expect(html).toContain("我的提示词");
    expect(html.match(/id="prompt-composer-heading"/g)?.length).toBe(1);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("mobile-prompt-dock");
  });

  test("the fallback preserves selected tags, weights and the original preview", () => {
    const html = renderToStaticMarkup(<ResponsivePromptComposer
      {...props}
      tags={[{
        id: "mikoto", name: "misaka mikoto", translation: "御坂美琴",
        category: "characters", group: "index", aliases: [], popular: false,
      }]}
      weights={{ mikoto: 1 }}
      prompt="{misaka_mikoto}"
    />);
    expect(html).toContain('data-weight-step="1"');
    expect(html).toContain("{misaka_mikoto}");
    expect(html).toContain('aria-label="移除 misaka mikoto"');
  });
});
