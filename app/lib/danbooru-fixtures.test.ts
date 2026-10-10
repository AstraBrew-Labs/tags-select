import type { DanbooruSearchResponse } from "./danbooru-types";

/** Shape captured from a real search; no credentials or quota notice stored. */
export const danbooruFixture: DanbooruSearchResponse = {
  node: "domestic",
  tags_all: "white_serafuku",
  tags_sfw: "white_serafuku",
  keywords: ["白色水手服"],
  results: [
    {
      tag: "white_serafuku",
      cn_name: "白色水手服,水手服,制服,校服",
      category: "General",
      nsfw: "0",
      final_score: 0.9297,
      semantic_score: 1,
      count: 4792,
      source: "白色水手服",
      layer: "中文核心词",
      wiki: "上衣和裙子均为白色的水手服，不包括领巾和领子。",
      artist_top_tags: [],
      alias_from: null,
    },
  ],
};
