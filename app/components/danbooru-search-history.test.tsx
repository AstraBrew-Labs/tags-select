import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DanbooruSearchHistory from "./danbooru-search-history";
import type { DanbooruHistoryEntry } from "../lib/danbooru-history";

const props = {
  loading: false,
  onReplay: () => {},
  onRemove: () => {},
  onClear: () => {},
};
const entry: DanbooruHistoryEntry = {
  query: "白色水手服",
  limit: 30,
  show_nsfw: false,
  lastSearchedAt: Date.UTC(2026, 9, 10, 4, 20),
};
describe("search history UI", () => {
  test("shows the empty state and explains local-only storage", () => {
    const html = renderToStaticMarkup(<DanbooruSearchHistory {...props} entries={[]} />);
    expect(html).toContain("搜索历史");
    expect(html).toContain("暂无搜索记录");
    expect(html).toContain("当前浏览器保存最近");
    expect(html).toContain("30");
    expect(html).not.toContain("清空历史");
  });
  test("provides separate replay/delete actions and original adult settings", () => {
    const html = renderToStaticMarkup(
      <DanbooruSearchHistory {...props} entries={[entry, { ...entry, show_nsfw: true }]} />,
    );
    expect(html).toContain('aria-label="再次搜索：白色水手服（仅安全标签）"');
    expect(html).toContain('aria-label="再次搜索：白色水手服（包含成人标签）"');
    expect(html).toContain('aria-label="删除搜索记录：白色水手服（仅安全标签）"');
    expect(html).toContain("清空历史");
    expect(html).toMatch(/datetime="2026-10-10T04:20:00\.000Z"/i);
    for (const button of html.matchAll(/<button\b[^>]*>([\s\S]*?)<\/button>/g))
      expect(button[1]).not.toContain("<button");
  });
  test("shows the latest three with an all-history toggle", () => {
    const entries = Array.from({ length: 10 }, (_, index) => ({ ...entry, query: `query-${index}` }));
    const html = renderToStaticMarkup(<DanbooruSearchHistory {...props} entries={entries} />);
    expect(html.match(/aria-label="再次搜索：/g)).toHaveLength(3);
    expect(html).toContain("查看全部 10 条");
    expect(html).toContain('aria-expanded="false"');
  });
  test("long queries remain intact and replay buttons are disabled during search", () => {
    const query = "一个穿着白色水手服的少女，在雨中的城市街道奔跑。".repeat(5);
    const html = renderToStaticMarkup(
      <DanbooruSearchHistory {...props} loading entries={[{ ...entry, query }]} />,
    );
    expect(html).toContain(query);
    expect(html).toContain('class="danbooru-history-query-text"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="再次搜索：/);
  });
});
