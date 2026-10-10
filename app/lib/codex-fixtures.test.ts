import { DIRECTOR_CODEX_URL, type CodexCatalog } from "./director-codex";

export const codexFixture: CodexCatalog = {
  version: 1,
  categories: [
    { id: "style", title: "各种风格", count: 1 },
    { id: "winter", title: "冬装", count: 1 },
  ],
  entries: [
    {
      id: "watercolor", categoryId: "style", title: "水彩风格", anchor: "水彩",
      groups: [{ label: "标签组 1", prompt: "{watercolor}, 0.7::lineart::, artist:example" }],
      notes: ["请勿添加额外画风"],
    },
    {
      id: "coat", categoryId: "winter", title: "冬季大衣", anchor: "冬季大衣",
      groups: [{ label: "标签组 1", prompt: "winter_coat, scarf" }], notes: [],
    },
  ],
  source: {
    url: DIRECTOR_CODEX_URL, title: "所长常规NovalAI个人法典",
    author: "一般所长", edition: "2026.5.1",
    capturedAt: "2026-10-10T10:00:00.000Z", importedAt: null, omittedCount: 0,
  },
};
