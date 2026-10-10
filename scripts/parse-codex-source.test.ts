import { describe, expect, test } from "bun:test";
import { isCodexCatalog } from "../app/lib/director-codex";
import { isGeneralCodexContent, parseCodexSource } from "./parse-codex-source";

const date = "2026-10-10T10:00:00.000Z";
const source = `
<nav><h2 id="outside">导航不能导入</h2><p>navigation,</p></nav>
<div class="sl-markdown-content">
  <aside><p>所长常规NovalAI个人法典（2026.5.1版）</p></aside>
  <div><h2 id="style">各种风格</h2><a>Section titled</a></div>
  <div><h3 id="watercolor">水彩 &amp; 线稿</h3></div>
  <p>请勿添加额外画风</p>
  <p>{watercolor}, [sketch], -0.5::lineart::, artist:example, 【】,</p>
  <p>NAI4.5时期：</p><p>1，{{blue}}, han_(example),</p>
  <div><h3 id="camera">视角</h3></div>
  <p>wide shot：广角镜头<br>close-up：特写</p>
  <h2 id="winter">冬装</h2><h3 id="coat">大衣</h3>
  <p>winter_coat, scarf, &#x26;light,</p>
  <h3 id="empty">只有备注</h3><p>没有标签组</p>
</div>
<footer><h2 id="footer">页脚</h2><p>footer,</p></footer>`;

describe("non-executing codex HTML extraction", () => {
  test("extracts only the body heading hierarchy and preserves the source order", () => {
    const data = parseCodexSource(source, date);
    expect(isCodexCatalog(data)).toBe(true);
    expect(data.categories.map((item) => item.title)).toEqual(["各种风格", "冬装"]);
    expect(data.entries.map((item) => item.title)).toEqual(["水彩 & 线稿", "视角", "大衣"]);
    expect(data.categories.map((item) => item.count)).toEqual([2, 1]);
    expect(data.source.edition).toBe("2026.5.1");
    expect(data.source.capturedAt).toBe(date);
  });
  test("preserves weights, artist colons, placeholders, internal parentheses and notes", () => {
    const entry = parseCodexSource(source, date).entries[0];
    expect(entry.notes).toEqual(["请勿添加额外画风"]);
    expect(entry.groups[0].prompt).toBe("{watercolor}, [sketch], -0.5::lineart::, artist:example, 【】,");
    expect(entry.groups[1]).toEqual({ label: "NAI4.5时期 · 标签组 1", prompt: "{{blue}}, han_(example)," });
  });
  test("separates explanatory lists from the actual tags and decodes numeric entities", () => {
    const data = parseCodexSource(source, date);
    expect(data.entries[1].groups).toEqual([
      { label: "广角镜头", prompt: "wide shot" },
      { label: "特写", prompt: "close-up" },
    ]);
    expect(data.entries[2].groups[0].prompt).toBe("winter_coat, scarf, &light,");
  });
  test("keeps identities stable across repeated imports and rejects changed markup", () => {
    expect(parseCodexSource(source, date).entries.map((entry) => entry.id))
      .toEqual(parseCodexSource(source, "2026-10-11T00:00:00Z").entries.map((entry) => entry.id));
    expect(() => parseCodexSource("<h2>No content container</h2>", date)).toThrow();
    expect(() => parseCodexSource('<div class="sl-markdown-content"><h2 id="x">x</h2>', date)).toThrow();
  });
  test("does not execute embedded scripts or retain their text", () => {
    const data = parseCodexSource(source.replace("<p>winter_coat", "<script>throw new Error('Do not execute')</script><p>winter_coat"), date);
    expect(JSON.stringify(data)).not.toContain("Do not execute");
    expect(data.entries).toHaveLength(3);
  });
  test("excludes an entire out-of-scope entry rather than editing its recipe", () => {
    const data = parseCodexSource(source.replace("winter_coat, scarf", "nsfw, winter_coat, scarf"), date);
    expect(data.entries.some((entry) => entry.title === "大衣")).toBe(false);
    expect(data.source.omittedCount).toBe(1);
    expect(isGeneralCodexContent("nsfw_style")).toBe(false);
    expect(isGeneralCodexContent("winter_coat, scarf")).toBe(true);
  });
});
