import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DanbooruSearch, {
  DanbooruResults,
  DanbooruRecommendations,
  DanbooruSelectedTags,
  DanbooruSearchContext,
  DanbooruTagDetails,
  getDanbooruDisplayName,
  getDanbooruArtistUrl,
  getDanbooruWikiUrl,
} from "./danbooru-search";
import { danbooruFixture } from "../lib/danbooru-fixtures.test";

describe("Danbooru search UI", () => {
  test("initial view provides distinct service attribution and privacy notice", () => {
    const html = renderToStaticMarkup(<DanbooruSearch />);
    expect(html).toContain("Danbooru 搜索关键词");
    expect(html).toContain("数据源：Danbooru 数据库");
    expect(html).toContain("服务提供：Danbooru Tag Searcher API");
    expect(html).toContain("不写入本站数据库");
    expect(html).toContain("成功结果缓存一天");
    expect(html).toContain("搜索历史");
    expect(html).toContain("暂无搜索记录");
    expect(html).toContain("<textarea");
    expect(html).toMatch(/maxlength="10000"/i);
    expect(html).toContain("自动去除加减权语法");
    expect(html).toContain("清空输入");
    expect(html).not.toContain("Authorization");
  });
  test("renders bilingual results, native cards and transparent copy buttons", () => {
    const html = renderToStaticMarkup(
      <DanbooruResults data={danbooruFixture} onCopy={() => {}} />,
    );
    expect(html).toContain("白色水手服");
    expect(html).toContain("white_serafuku");
    expect(html).toContain("复制 white_serafuku");
    expect(html).toContain("使用量 4,792");
    expect(html).toContain("<h3>白色水手服</h3>");
    expect(html).toContain("展开 white_serafuku 的完整说明");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("danbooru-definition");
    expect(html).toContain(
      'href="https://danbooru.donmai.us/wiki_pages/white_serafuku"',
    );
    expect(html).toContain("查看 white_serafuku 的 Danbooru 详细资料");
    expect(html).toContain("详细资料");
    expect(html).toContain('target="_blank"');
    expect(html).not.toContain("checkbox");
  });
  test("short titles preserve every alias and long definition in expandable details", () => {
    const tag = {
      ...danbooruFixture.results[0],
      cn_name: " 白色水手服，水手服,制服,校服 ",
      wiki: "第一段说明。\n\n".repeat(100) + "完整说明的最后一段。",
      alias_from: "sailor_uniform",
      artist_top_tags: ["long_hair", "white_serafuku"],
    };
    expect(getDanbooruDisplayName(tag)).toBe("白色水手服");
    expect(getDanbooruDisplayName({ cn_name: " ,， ", tag: "english_tag" })).toBe("english_tag");
    const html = renderToStaticMarkup(<DanbooruTagDetails tag={tag} />);
    expect(html).toContain(tag.cn_name);
    expect(html).toContain(tag.wiki);
    expect(html).toContain("完整说明的最后一段");
    expect(html).toContain("sailor_uniform");
    expect(html).toContain("中文核心词");
    expect(html).toContain("long_hair、white_serafuku");
  });
  test("long search context is collapsed by default without dropping description or keywords", () => {
    const query = "一个穿着白色水手服的少女，在大雨中的城市街道奔跑。".repeat(10);
    const keywords = Array.from({ length: 20 }, (_, index) => `识别关键词${index}`);
    const html = renderToStaticMarkup(<DanbooruSearchContext query={query} keywords={keywords} />);
    expect(html).toContain("搜索描述与识别关键词（20）");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain(query);
    for (const keyword of keywords) expect(html).toContain(keyword);
  });
  test("copy, external links and expand controls are siblings of the selectable card", () => {
    const html = renderToStaticMarkup(
      <DanbooruResults data={danbooruFixture} onCopy={() => {}} onToggleTag={() => {}} />,
    );
    const heading = html.indexOf("<h3>白色水手服</h3>");
    const actions = html.indexOf('class="danbooru-card-actions"');
    expect(actions).toBeGreaterThan(heading);
    expect(html.slice(heading, actions)).not.toContain("<button");
    expect(html.slice(heading, actions)).not.toContain("<a ");
  });
  test("encodes tag names when creating external wiki links", () => {
    expect(getDanbooruWikiUrl("artist:name (style)")).toBe(
      "https://danbooru.donmai.us/wiki_pages/artist%3Aname%20(style)",
    );
  });
  test("artist links search posts with the encoded tag, without an artist prefix", () => {
    expect(getDanbooruArtistUrl("name (style)&other")).toBe(
      "https://danbooru.donmai.us/posts?tags=name%20(style)%26other",
    );
    const html = renderToStaticMarkup(
      <DanbooruResults
        data={{
          ...danbooruFixture,
          results: [{ ...danbooruFixture.results[0], tag: "artist_one", category: "Artist" }],
        }}
        onCopy={() => {}}
      />,
    );
    expect(html).toContain('href="https://danbooru.donmai.us/posts?tags=artist_one"');
    expect(html).toContain("查看作品");
    expect(html).not.toContain("/wiki_pages/");
  });
  test("always renders four panels in row-major order with separate scroll regions", () => {
    const html = renderToStaticMarkup(<DanbooruSearch />);
    const panelIds = [...html.matchAll(/data-panel="([^"]+)"/g)].map((match) => match[1]);
    expect(panelIds).toEqual(["search-results", "artists", "same-category", "related"]);
    expect(html.match(/class="danbooru-panel-body"/g)).toHaveLength(4);
    expect(html).toContain('aria-label="搜索结果列表" tabindex="0"');
    expect(html.match(/先选择一个标签/g)).toHaveLength(3);
  });
  test("recommendation loading and error states keep all three panel shells", () => {
    const props = { result: null, selectedTags: ["white_serafuku"], onCopy: () => {} };
    const loadingHtml = renderToStaticMarkup(<DanbooruRecommendations {...props} loading />);
    expect(loadingHtml.match(/data-panel=/g)).toHaveLength(3);
    expect(loadingHtml.match(/aria-busy="true"/g)).toHaveLength(3);
    expect(loadingHtml.match(/正在查找推荐/g)).toHaveLength(3);
    const errorHtml = renderToStaticMarkup(
      <DanbooruRecommendations {...props} error="请稍后重试" onRetry={() => {}} />,
    );
    expect(errorHtml.match(/data-panel=/g)).toHaveLength(3);
    expect(errorHtml.match(/重试推荐/g)).toHaveLength(3);
    expect(errorHtml.match(/role="alert"/g)).toHaveLength(3);
  });
  test("blank Chinese displays English once and no invented translation", () => {
    const data = {
      ...danbooruFixture,
      results: [{ ...danbooruFixture.results[0], cn_name: " " }],
    };
    const html = renderToStaticMarkup(
      <DanbooruResults data={data} onCopy={() => {}} />,
    );
    expect(html).toContain("<h3>white_serafuku</h3>");
    expect(html).not.toContain("danbooru-english");
    expect(html).not.toContain("暂无翻译");
  });
  test("search result cards can be selected for recommendations", () => {
    const html = renderToStaticMarkup(
      <DanbooruResults
        data={danbooruFixture}
        onCopy={() => {}}
        selectedTags={["white_serafuku"]}
        onToggleTag={() => {}}
      />,
    );
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("已选择此标签");
    const unselectedHtml = renderToStaticMarkup(
      <DanbooruResults
        data={danbooruFixture}
        onCopy={() => {}}
        selectedTags={[]}
        onToggleTag={() => {}}
      />,
    );
    expect(unselectedHtml).toContain("点击卡片选择此标签");
  });
  test("recommendation basis displays selections that are absent from current search results", () => {
    const items = [
      danbooruFixture.results[0],
      { ...danbooruFixture.results[0], tag: "long_hair", cn_name: "" },
    ];
    const html = renderToStaticMarkup(
      <DanbooruSelectedTags items={items} onRemove={() => {}} onClear={() => {}} />,
    );
    expect(html).toContain("跨搜索推荐依据");
    expect(html).toContain("推荐依据 2/8");
    expect(html).toContain("白色水手服 · white_serafuku");
    expect(html).toContain("long_hair");
    expect(html).toContain("清空选择");
    expect(html.match(/aria-label="close"/g)).toHaveLength(2);
    expect(html).not.toContain("checkbox");
    expect(renderToStaticMarkup(
      <DanbooruSelectedTags items={[]} onRemove={() => {}} onClear={() => {}} />,
    )).toBe("");
    const currentResults = renderToStaticMarkup(
      <DanbooruResults data={danbooruFixture} selectedTags={items.map((item) => item.tag)}
        onCopy={() => {}} onToggleTag={() => {}} />,
    );
    expect(currentResults).toContain('aria-pressed="true"');
  });
  test("renders artist, same-category and related recommendation sections", () => {
    const html = renderToStaticMarkup(
      <DanbooruRecommendations
        selectedTags={["white_serafuku"]}
        result={{
          cached: false,
          data: {
            artists: [
              {
                artist: "artist_one",
                cooc_count: 8,
                post_count: 120,
                sources: ["white_serafuku"],
                top_tags: ["long_hair"],
              },
            ],
            sameCategory: [
              {
                tag: "white_sailor_collar",
                cn_name: "白色水手领",
                category: "General",
                sources: ["white_serafuku"],
                wiki: "说明",
              },
            ],
            related: [],
            nodes: {
              artists: "domestic",
              sameCategory: "domestic",
              related: "domestic",
            },
          },
        }}
        onCopy={() => {}}
      />,
    );
    expect(html).toContain("推荐擅长画师");
    expect(html).toContain("同类标签");
    expect(html).toContain("关联推荐");
    expect(html).toContain("artist_one");
    expect(html).toContain("white_sailor_collar");
    expect(html).toContain('href="https://danbooru.donmai.us/posts?tags=artist_one"');
    expect(html).not.toContain("wiki_pages/artist");
    expect(html).toContain('href="https://danbooru.donmai.us/wiki_pages/white_sailor_collar"');
  });
  test("same-category cards share search selection states with actions outside the card", () => {
    const same = {
      tag: "white_sailor_collar", cn_name: "白色水手领", category: "General",
      sources: ["white_serafuku"], wiki: "说明",
    };
    const result = {
      cached: false,
      data: {
        artists: [], sameCategory: [same],
        related: [{ ...same, tag: "related_only" }],
        nodes: {
          artists: "domestic", sameCategory: "domestic", related: "domestic",
        } as const,
      },
    };
    const props = { result, onCopy: () => {}, onToggleTag: () => {} };
    const html = renderToStaticMarkup(
      <DanbooruRecommendations {...props} selectedTags={["white_serafuku", same.tag]} />,
    );
    const panel = html.slice(html.indexOf('data-panel="same-category"'), html.indexOf('data-panel="related"'));
    expect(panel).toContain('role="button"');
    expect(panel).toContain('tabindex="0"');
    expect(panel).toContain('aria-pressed="true"');
    expect(panel).toContain("再次点击取消");
    expect(panel).toContain("点击卡片加入推荐依据");
    expect(panel).not.toContain("checkbox");
    const heading = panel.indexOf("<h3>白色水手领</h3>");
    const actions = panel.indexOf('class="danbooru-card-actions"');
    expect(actions).toBeGreaterThan(heading);
    expect(panel.slice(heading, actions)).not.toContain("<button");
    expect(panel.slice(heading, actions)).not.toContain("<a ");
    expect(panel).toContain("复制 推荐标签 white_sailor_collar");
    const unselected = renderToStaticMarkup(
      <DanbooruRecommendations {...props} selectedTags={["white_serafuku"]} />,
    );
    expect(unselected).toContain('aria-pressed="false"');
    const relatedPanel = html.slice(html.indexOf('data-panel="related"'));
    expect(relatedPanel).not.toContain("aria-pressed");
  });
});
