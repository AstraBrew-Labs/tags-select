import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import TagCard from "./tag-card";
import type { NovelTag } from "../lib/tag-catalog";

const tag: NovelTag = {
  id: "body:test",
  category: "body",
  group: "body:group",
  name: "long hair",
  translation: "长发",
  aliases: [],
  popular: true,
};
function render(
  selected = false,
  favorite = false,
  value = tag,
  disabled = false,
) {
  return renderToStaticMarkup(
    <TagCard
      tag={value}
      selected={selected}
      favorite={favorite}
      disabled={disabled}
      onSelect={() => {}}
      onFavorite={() => {}}
    />,
  );
}
function cardClass(html: string) {
  return html.match(/class="([^"]*animal-card-[^"]*tag-card[^"]*)"/)?.[1];
}

describe("library-composed tag cards", () => {
  test("selects the whole card using the library teal color, with no Checkbox", () => {
    const initial = render(),
      selected = render(true);
    expect(cardClass(initial)).toBeTruthy();
    expect(cardClass(initial)).not.toContain("animal-card-app-teal-");
    expect(cardClass(selected)).toContain("animal-card-app-teal-");
    expect(initial).toContain("animal-card-hoverable-");
    expect(initial).toMatch(/<div[^>]*class="[^"]*tag-card[^>]*role="button"/);
    expect(initial).toContain('tabindex="0"');
    expect(initial).not.toContain("tag-card-hit-area");
    expect(initial).toContain('aria-pressed="false"');
    expect(selected).toContain('aria-pressed="true"');
    expect(initial).not.toContain('type="checkbox"');
    expect(selected).not.toContain('type="checkbox"');
    expect(selected).not.toContain('style="background');
    for (const html of [initial, selected]) {
      expect(html).not.toContain("点击卡片加入");
      expect(html).not.toContain("tag-card-selection-label");
      expect(html).not.toContain("tag-card-actions");
      expect(html).not.toContain("tag-card-hit-area");
    }
  });
  test("disabled state takes precedence and disables both interactions", () => {
    const html = render(true, true, tag, true);
    expect(html).toContain('data-disabled="true"');
    expect(cardClass(html)).not.toContain("animal-card-hoverable-");
    expect(cardClass(html)).not.toContain("animal-card-app-teal-");
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html.match(/ disabled=""/g)?.length).toBe(1);
    expect(html).toContain("不可选择");
  });
  test("uses the transparent library link-button variant for favorites", () => {
    const initial = render(),
      favorite = render(false, true);
    expect(initial).toMatch(
      /class="[^"]*animal-btn-link-[^"]*tag-card-favorite/,
    );
    expect(initial).toContain('aria-pressed="false"');
    expect(favorite).toContain('aria-pressed="true"');
    expect(initial).toContain("收藏 long hair");
    expect(favorite).toContain("取消收藏 long hair");
  });
  test("favorite is a sibling, never nested in the selectable card", () => {
    const html = render();
    expect(html).toContain("tag-card-favorite-wrap");
    const interactiveCard = html.match(
      /<div[^>]*class="[^"]*tag-card[^>]*role="button"[\s\S]*?<\/header><\/div>/,
    )?.[0];
    expect(interactiveCard).toBeTruthy();
    expect(interactiveCard).not.toContain("<button");
    expect(interactiveCard).not.toContain("tag-card-favorite");
  });
  test("shows the Chinese label and complete English tooltip", () => {
    const html = render();
    expect(html).toContain("长发");
    expect(html).toContain('title="long hair"');
    expect(html).toContain('aria-labelledby="');
  });
  test("missing or whitespace-only Chinese displays English once without placeholder", () => {
    for (const translation of ["", "   ", "\t\n"]) {
      const html = render(false, false, { ...tag, translation });
      expect(html).toMatch(/<h3[^>]*title="long hair"[^>]*>long hair<\/h3>/);
      expect(html).not.toContain("tag-card-prompt");
      expect(html).not.toContain("未提供中文名称");
      expect(html).toContain('aria-labelledby="');
    }
  });
  test("artists without Chinese use English in their image alternative text", () => {
    const html = render(false, false, {
      ...tag,
      category: "illustrator",
      translation: "",
      name: "artist:anmi",
      imageUrl: "/images/artist/Anmi_anmi.webp",
    });
    expect(html).toContain('alt="artist:anmi画风参考"');
    expect(html).not.toContain("tag-card-prompt");
  });
  test("uses the library image frame for artist examples and renders safely on the server", () => {
    const html = render(false, false, {
      ...tag,
      category: "illustrator",
      translation: "Anmi",
      name: "artist:anmi",
      imageUrl: "/images/artist/Anmi_anmi.webp",
    });
    expect(html).toContain("animal-image-");
    expect(html).toContain("/images/artist/Anmi_anmi.webp");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("Anmi画风参考");
    expect(html).not.toContain("_next/image");
  });
  test("preserves an explicit image-missing state and source note", () => {
    const html = render(false, false, {
      ...tag,
      category: "illustrator",
      note: "来自源文件的备注",
    });
    expect(html).toContain("暂无本地参考图");
    expect(html).toContain("来自源文件的备注");
  });
});
