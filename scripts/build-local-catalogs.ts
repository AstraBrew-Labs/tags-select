import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { transformTagSource } from "./parse-tag-source";
import { isCatalogResponse } from "../app/lib/catalog-cache";
import { isCodexCatalog } from "../app/lib/director-codex";
import { isAdultCodexCatalog } from "../app/lib/adult-codex";

const [source, images, codex, adult] = await Promise.all([
  readFile("data/loadTags.js", "utf8"),
  readdir("public/images/artist"),
  readFile("data/director-codex.json", "utf8").then(JSON.parse),
  readFile("data/adult-codex.json", "utf8").then(JSON.parse),
]);
const parsed = transformTagSource(source, images.filter((file) => file.endsWith(".webp")));
const categoryCounts = new Map<string, number>();
const groupCounts = new Map<string, number>();
for (const tag of parsed.tags) {
  categoryCounts.set(tag.categoryId, (categoryCounts.get(tag.categoryId) ?? 0) + 1);
  groupCounts.set(tag.groupId, (groupCounts.get(tag.groupId) ?? 0) + 1);
}
const catalog = {
  categories: parsed.categories.map((category) => ({
    id: category.id, sourceKey: category.sourceKey, nameZh: category.nameZh,
    nameEn: category.nameEn, count: categoryCounts.get(category.id) ?? 0,
  })),
  groups: parsed.groups.map((group) => ({
    id: group.id, categoryId: group.categoryId, nameZh: group.nameZh,
    count: groupCounts.get(group.id) ?? 0,
  })),
  tags: parsed.tags.map(({ id, categoryId, groupId, zh, en, aliases, note, imageUrl, popular }) => ({
    id, categoryId, groupId, zh, en, aliases, note, imageUrl, popular,
  })),
  source: null,
};
if (!isCatalogResponse(catalog) || !isCodexCatalog(codex) || !isAdultCodexCatalog(adult)) {
  throw new Error("Invalid local catalog snapshot");
}
await mkdir("public/data", { recursive: true });
await Promise.all(Object.entries({ catalog, codex, "adult-codex": adult }).map(async ([name, data]) => {
  const json = JSON.stringify(data);
  await Promise.all([
    writeFile(`public/data/${name}.json`, json),
    writeFile(`public/data/${name}.json.gz`, gzipSync(json)),
  ]);
}));
console.log("Generated three validated local catalog snapshots from data/.");
