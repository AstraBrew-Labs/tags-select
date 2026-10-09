import { createHash } from "node:crypto";
import { parse, type Expression, type ObjectExpression } from "acorn";
import { sourceCategories } from "./source-categories";

type SourceObject = { [key: string]: string | SourceObject };

/** Extract a literal; never import, eval, or execute the supplied JavaScript. */
export function parseTagSource(source: string): SourceObject {
  const program = parse(source, {
    ecmaVersion: "latest",
    sourceType: "script",
  });
  let root: ObjectExpression | undefined;
  for (const statement of program.body) {
    if (statement.type === "EmptyStatement") continue;
    if (statement.type !== "VariableDeclaration")
      throw new Error("数据文件只允许 Tagjson 对象声明，不能执行其他语句。");
    for (const declaration of statement.declarations) {
      if (
        declaration.id.type !== "Identifier" ||
        declaration.id.name !== "Tagjson" ||
        declaration.init?.type !== "ObjectExpression" ||
        root
      ) {
        throw new Error("数据源需要且只能包含一个 Tagjson 对象字面量。");
      }
      root = declaration.init;
    }
  }
  if (!root) throw new Error("未找到 Tagjson 对象。");

  function read(node: Expression): string | SourceObject {
    if (node.type === "Literal" && typeof node.value === "string")
      return node.value;
    if (node.type !== "ObjectExpression")
      throw new Error(
        "标签数据只能包含对象和字符串，不允许表达式、函数或展开运算。",
      );
    const result: SourceObject = Object.create(null);
    for (const property of node.properties) {
      if (
        property.type !== "Property" ||
        property.computed ||
        property.method ||
        property.kind !== "init"
      )
        throw new Error("标签字段必须为静态属性。");
      const key =
        property.key.type === "Identifier"
          ? property.key.name
          : property.key.type === "Literal" &&
              typeof property.key.value === "string"
            ? property.key.value
            : undefined;
      if (key === undefined) throw new Error("标签属性名必须为字符串。");
      // Like an object literal on the source site, a later duplicate property wins.
      result[key] = read(property.value as Expression);
    }
    return result;
  }
  return read(root) as SourceObject;
}

export function stableId(prefix: string, parts: string[]) {
  return `${prefix}:${createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 24)}`;
}

const commonPrompts = new Set([
  "1girl",
  "1boy",
  "solo",
  "long hair",
  "short hair",
  "blonde hair",
  "smile",
  "blush",
  "looking at viewer",
  "forest",
  "garden",
  "beach",
  "sunset",
  "watercolor",
  "pastel colors",
  "portrait",
]);
export function normalizedPrompt(value: string) {
  return value.trim().toLowerCase().replace(/_/g, " ");
}

export function transformTagSource(source: string, imageFiles: string[] = []) {
  const raw = parseTagSource(source);
  const knownCategories = new Set<string>(
    sourceCategories.map((category) => category.sourceKey),
  );
  for (const key of Object.keys(raw))
    if (!knownCategories.has(key)) throw new Error(`未映射原站分类：${key}`);
  const availableImages = new Map(
    imageFiles.map((file) => [file.normalize("NFC"), file]),
  );
  const categories = sourceCategories.map((category, sortOrder) => ({
    ...category,
    sortOrder,
  }));
  const groups: {
    id: string;
    categoryId: string;
    nameZh: string;
    sortOrder: number;
  }[] = [];
  const tags: {
    id: string;
    categoryId: string;
    groupId: string;
    zh: string;
    en: string;
    rawZh: string;
    rawEn: string;
    aliases: string[];
    note: string | null;
    imageUrl: string | null;
    sortOrder: number;
    popular: boolean;
  }[] = [];
  const missingImages: string[] = [];
  for (const category of categories) {
    const rawGroups = raw[category.sourceKey];
    if (!rawGroups || typeof rawGroups === "string")
      throw new Error(`分类 ${category.sourceKey} 必须包含子分组。`);
    for (const [groupOrder, [groupName, entries]] of Object.entries(
      rawGroups,
    ).entries()) {
      if (typeof entries === "string")
        throw new Error(`分组 ${groupName} 必须为标签对象。`);
      const groupId = stableId(category.id, [groupName]);
      groups.push({
        id: groupId,
        categoryId: category.id,
        nameZh: groupName,
        sortOrder: groupOrder,
      });
      for (const [tagOrder, [rawZh, rawEn]] of Object.entries(
        entries,
      ).entries()) {
        if (typeof rawEn !== "string")
          throw new Error(`标签 ${rawZh} 的英文值必须为字符串。`);
        const variants = rawZh
          .split("|")
          .map((value) => value.trim())
          .filter(Boolean);
        const [en, ...notes] = rawEn.split(/\s*\/\/\s*/);
        let imageUrl: string | null = null;
        if (category.sourceKey === "Illustrator") {
          const suffix = rawEn.replace("artist:", "");
          const expected = `${rawZh}_${suffix.includes(",") ? "画风" : suffix}.webp`;
          const filename = availableImages.get(expected.normalize("NFC"));
          if (filename)
            imageUrl = `/images/artist/${encodeURIComponent(filename)}`;
          else missingImages.push(expected);
        }
        tags.push({
          id: stableId(category.id, [groupName, rawZh]),
          categoryId: category.id,
          groupId,
          zh: variants[0] ?? "",
          en: en.trim(),
          rawZh,
          rawEn,
          aliases: variants.slice(1),
          note: notes.length ? notes.join(" // ") : null,
          imageUrl,
          sortOrder: tagOrder,
          popular:
            commonPrompts.has(normalizedPrompt(en)) ||
            (category.sourceKey === "Quality" && rawZh === "最高画质"),
        });
      }
    }
  }
  return {
    categories,
    groups,
    tags,
    missingImages,
    sourceHash: createHash("sha256").update(source).digest("hex"),
  };
}
