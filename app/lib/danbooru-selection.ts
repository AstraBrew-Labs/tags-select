import {
  DANBOORU_RECOMMENDATION_TAG_LIMIT,
  isDanbooruNsfw,
  type DanbooruRelatedRecommendation,
  type DanbooruTag,
} from "./danbooru-types";
import type { DanbooruRecommendationInput } from "./danbooru-recommendations";

// Keep the selected metadata independently of the current search response.
// A new query must not lose names, categories or safety flags of older choices.
export type DanbooruSelection = Pick<
  DanbooruTag,
  "tag" | "cn_name" | "category" | "nsfw"
>;

export function createDanbooruRecommendationSelection(
  item: DanbooruRelatedRecommendation,
  showNsfw: boolean,
): DanbooruSelection {
  return {
    tag: item.tag,
    cn_name: item.cn_name,
    category: item.category,
    // RelatedOut lacks per-tag safety flags. Safe-mode results are filtered by
    // the service; an adult-mode result must not be assumed safe when toggling off.
    nsfw: showNsfw ? "unknown" : "0",
  };
}

export function toggleDanbooruSelection(
  selected: readonly DanbooruSelection[],
  item: DanbooruSelection,
): readonly DanbooruSelection[] {
  if (selected.some((current) => current.tag === item.tag))
    return selected.filter((current) => current.tag !== item.tag);
  // Do not silently evict a user's earlier choice when the API limit is reached.
  if (selected.length >= DANBOORU_RECOMMENDATION_TAG_LIMIT) return selected;
  return [
    ...selected,
    {
      tag: item.tag,
      cn_name: item.cn_name,
      category: item.category,
      nsfw: item.nsfw,
    },
  ];
}

export function filterDanbooruSelection(
  selected: readonly DanbooruSelection[],
  showNsfw: boolean,
): readonly DanbooruSelection[] {
  if (showNsfw) return selected;
  const safe = selected.filter((item) => !isDanbooruNsfw(item.nsfw));
  return safe.length === selected.length ? selected : safe;
}

export function getDanbooruSelectionInput(
  selected: readonly DanbooruSelection[],
  showNsfw: boolean,
): DanbooruRecommendationInput {
  const items = filterDanbooruSelection(selected, showNsfw);
  return {
    tags: items.map((item) => item.tag),
    categories: [...new Set(items.map((item) => item.category))],
    show_nsfw: showNsfw,
  };
}
