/** Shared API contract only. No database code or source dataset is shipped here. */
export type TagCategory =
  | "quality"
  | "characters"
  | "scene"
  | "environment"
  | "composition"
  | "artStyle"
  | "background"
  | "expression"
  | "face"
  | "body"
  | "clothing"
  | "accessories"
  | "characterDesign"
  | "action"
  | "illustrator"
  | "r18";
export type CatalogCategory = {
  id: TagCategory;
  sourceKey: string;
  nameZh: string;
  nameEn: string;
  count: number;
};
export type CatalogGroup = {
  id: string;
  categoryId: TagCategory;
  nameZh: string;
  count: number;
};
export type CatalogTag = {
  id: string;
  categoryId: TagCategory;
  groupId: string;
  zh: string;
  en: string;
  aliases: string[];
  note: string | null;
  imageUrl: string | null;
  popular: boolean;
};
export type CatalogResponse = {
  categories: CatalogCategory[];
  groups: CatalogGroup[];
  tags: CatalogTag[];
  source: {
    sourceFile: string;
    sourceUrl: string;
    importedAt: string;
    tagCount: number;
    imageCount: number;
  } | null;
};
