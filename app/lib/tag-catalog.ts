/** Client-side index of API data. There is no bundled static tag collection. */
import type { CatalogResponse, TagCategory } from "./catalog-types";
import { createPromptLookup } from "./prompt-lookup";
import {
  formatWeightedPrompt,
  type PromptWeightOptions,
} from "./prompt-weights";
export type { TagCategory } from "./catalog-types";
export type NovelTag = {
  id: string;
  name: string;
  translation: string;
  category: TagCategory;
  group: string;
  aliases: string[];
  popular: boolean;
  note?: string;
  imageUrl?: string;
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/_/g, " ");
}
function legacyLeaf(value: string) {
  const words = normalize(
    value.split(",")[0].replace(/^(?:color\??|artist):/, ""),
  )
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return words
    .map((word, index) =>
      index === 0 ? word : word[0].toUpperCase() + word.slice(1),
    )
    .join("");
}
const recipeDefinitions = [
  {
    name: "花园里的少女",
    description: "轻柔的水彩，和刚刚好的阳光",
    prompts: [
      "1girl",
      "solo",
      "long hair",
      "summer dress",
      "smile",
      "garden",
      "watercolor",
      "pastel colors",
    ],
  },
  {
    name: "落日海岸",
    description: "没有人物，只有属于你的宁静",
    prompts: ["no humans", "beach", "sunset", "watercolor"],
  },
  {
    name: "日常小肖像",
    description: "从一个简单、温暖的角色开始",
    prompts: [
      "1girl",
      "solo",
      "short hair",
      "aran sweater",
      "smile",
      "portrait",
      "best quality",
    ],
  },
];

export function createTagCatalog(response: CatalogResponse) {
  const tags: NovelTag[] = response.tags.map((tag) => ({
    id: tag.id,
    name: tag.en,
    translation: tag.zh,
    category: tag.categoryId,
    group: tag.groupId,
    aliases: tag.aliases,
    popular: tag.popular,
    note: tag.note ?? undefined,
    imageUrl: tag.imageUrl ?? undefined,
  }));
  const categories = response.categories.map((category) => ({
    ...category,
    name: category.nameZh,
  }));
  const groups = response.groups;
  const tagById = new Map(tags.map((tag) => [tag.id, tag]));
  const tagByPrompt = new Map<string, NovelTag>();
  const legacyLookup = new Map<string, NovelTag>();
  const searchableText = new Map<string, string>();
  const groupNames = new Map(groups.map((group) => [group.id, group.nameZh]));
  for (const tag of tags) {
    for (const prompt of [tag.name, tag.name.split(",")[0]])
      if (!tagByPrompt.has(normalize(prompt)))
        tagByPrompt.set(normalize(prompt), tag);
    const legacyKey = `${tag.category}.${legacyLeaf(tag.name)}`;
    if (!legacyLookup.has(legacyKey)) legacyLookup.set(legacyKey, tag);
    searchableText.set(
      tag.id,
      normalize(
        `${tag.name} ${tag.translation} ${tag.aliases.join(" ")} ${groupNames.get(tag.group) ?? ""}`,
      ),
    );
  }
  function normalizeTagIds(ids: readonly string[]) {
    const out = new Set<string>();
    for (const id of ids) {
      const parts = id.split(".");
      const tag =
        tagById.get(id) ??
        tagByPrompt.get(normalize(id)) ??
        (parts.length === 3
          ? legacyLookup.get(`${parts[0]}.${parts[2]}`)
          : undefined);
      if (tag) out.add(tag.id);
    }
    return [...out];
  }
  function filterTags({
    query = "",
    category = "all",
    group = "all",
    onlyPopular = false,
    favorites,
    selected,
  }: {
    query?: string;
    category?: string;
    group?: string;
    onlyPopular?: boolean;
    favorites?: readonly string[];
    selected?: readonly string[];
  } = {}) {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const favoriteIds = favorites
      ? new Set(normalizeTagIds(favorites))
      : undefined;
    const selectedIds = selected
      ? new Set(normalizeTagIds(selected))
      : undefined;
    return tags.filter(
      (tag) =>
        (category === "all" || tag.category === category) &&
        (group === "all" || tag.group === group) &&
        (!onlyPopular || tag.popular) &&
        (!favoriteIds || favoriteIds.has(tag.id)) &&
        (!selectedIds || selectedIds.has(tag.id)) &&
        words.every((word) => searchableText.get(tag.id)?.includes(word)),
    );
  }
  function formatPrompt(
    ids: readonly string[],
    options: PromptWeightOptions = {},
  ) {
    return formatWeightedPrompt(
      normalizeTagIds(ids).map((id) => ({
        name: tagById.get(id)!.name,
        step: options.weights?.[id] ?? 0,
      })),
      options.syntax,
    );
  }
  const recipes = recipeDefinitions
    .map((recipe) => ({
      name: recipe.name,
      description: recipe.description,
      ids: [
        ...new Set(
          recipe.prompts.flatMap((prompt) => {
            const tag = tagByPrompt.get(normalize(prompt));
            return tag ? [tag.id] : [];
          }),
        ),
      ],
    }))
    .filter((recipe) => recipe.ids.length > 0);
  const lookupPrompt = createPromptLookup(tags);
  return {
    lookupPrompt,
    tags,
    categories,
    groups,
    tagById,
    normalizeTagIds,
    filterTags,
    formatPrompt,
    recipes,
    source: response.source,
  };
}
export const emptyCatalog = createTagCatalog({
  categories: [],
  groups: [],
  tags: [],
  source: null,
});
