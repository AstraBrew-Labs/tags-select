import "dotenv/config";
import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { Prisma } from "../generated/prisma/client";
import { createPrismaClient } from "../lib/prisma-client";
import { transformTagSource } from "./parse-tag-source";
import { SOURCE_SITE } from "./source-categories";

const sourcePath = resolve(process.env.TAGS_SOURCE ?? "data/loadTags.js");
const [source, imageFiles] = await Promise.all([
  readFile(sourcePath, "utf8"),
  readdir(resolve("public/images/artist")),
]);
const data = transformTagSource(
  source,
  imageFiles.filter((file) => file.endsWith(".webp")),
);
const imageCount = data.tags.filter((tag) => tag.imageUrl).length;
const dryRun = process.argv.includes("--dry-run");
const importedAt = new Date();
const catalogGzip = gzipSync(
  JSON.stringify({
    categories: data.categories.map((category) => ({
      id: category.id,
      sourceKey: category.sourceKey,
      nameZh: category.nameZh,
      nameEn: category.nameEn,
      count: data.tags.filter((tag) => tag.categoryId === category.id).length,
    })),
    groups: data.groups.map((group) => ({
      id: group.id,
      categoryId: group.categoryId,
      nameZh: group.nameZh,
      count: data.tags.filter((tag) => tag.groupId === group.id).length,
    })),
    tags: data.tags.map(
      ({
        id,
        categoryId,
        groupId,
        zh,
        en,
        aliases,
        note,
        imageUrl,
        popular,
      }) => ({
        id,
        categoryId,
        groupId,
        zh,
        en,
        aliases,
        note,
        imageUrl,
        popular,
      }),
    ),
    source: {
      sourceFile: basename(sourcePath),
      sourceUrl: SOURCE_SITE,
      importedAt: importedAt.toISOString(),
      tagCount: data.tags.length,
      imageCount,
    },
  }),
);
console.log({
  source: basename(sourcePath),
  categories: data.categories.length,
  groups: data.groups.length,
  tags: data.tags.length,
  artistImages: imageCount,
  missingImages: data.missingImages.length,
  dryRun,
});

if (!dryRun) {
  const db = createPrismaClient();
  try {
    await db.$transaction(
      async (tx) => {
        for (const category of data.categories)
          await tx.tagCategory.upsert({
            where: { id: category.id },
            create: category,
            update: category,
          });
        // JSON is bound as a parameter, never interpolated into executable SQL.
        await tx.$executeRaw`
        INSERT INTO "novelai_tags"."TagGroup" ("id", "categoryId", "nameZh", "sortOrder")
        SELECT "id", "categoryId", "nameZh", "sortOrder"
        FROM jsonb_to_recordset(${JSON.stringify(data.groups)}::jsonb) AS x("id" text, "categoryId" text, "nameZh" text, "sortOrder" integer)
        ON CONFLICT ("id") DO UPDATE SET "categoryId" = EXCLUDED."categoryId", "nameZh" = EXCLUDED."nameZh", "sortOrder" = EXCLUDED."sortOrder"
      `;
        for (let offset = 0; offset < data.tags.length; offset += 400) {
          const batch = JSON.stringify(data.tags.slice(offset, offset + 400));
          await tx.$executeRaw(Prisma.sql`
          INSERT INTO "novelai_tags"."Tag" ("id", "categoryId", "groupId", "zh", "en", "rawZh", "rawEn", "aliases", "note", "imageUrl", "sortOrder", "popular")
          SELECT "id", "categoryId", "groupId", "zh", "en", "rawZh", "rawEn", "aliases", "note", "imageUrl", "sortOrder", "popular"
          FROM jsonb_to_recordset(${batch}::jsonb) AS x("id" text, "categoryId" text, "groupId" text, "zh" text, "en" text, "rawZh" text, "rawEn" text, "aliases" text[], "note" text, "imageUrl" text, "sortOrder" integer, "popular" boolean)
          ON CONFLICT ("id") DO UPDATE SET "categoryId" = EXCLUDED."categoryId", "groupId" = EXCLUDED."groupId", "zh" = EXCLUDED."zh", "en" = EXCLUDED."en", "rawZh" = EXCLUDED."rawZh", "rawEn" = EXCLUDED."rawEn", "aliases" = EXCLUDED."aliases", "note" = EXCLUDED."note", "imageUrl" = EXCLUDED."imageUrl", "sortOrder" = EXCLUDED."sortOrder", "popular" = EXCLUDED."popular"
        `);
        }
        await tx.catalogImport.upsert({
          where: { id: "loadTags.js" },
          create: {
            id: "loadTags.js",
            sourceFile: basename(sourcePath),
            sourceUrl: SOURCE_SITE,
            sourceHash: data.sourceHash,
            categoryCount: data.categories.length,
            groupCount: data.groups.length,
            tagCount: data.tags.length,
            imageCount,
            importedAt,
            catalogGzip,
          },
          update: {
            sourceFile: basename(sourcePath),
            sourceUrl: SOURCE_SITE,
            sourceHash: data.sourceHash,
            categoryCount: data.categories.length,
            groupCount: data.groups.length,
            tagCount: data.tags.length,
            imageCount,
            importedAt,
            catalogGzip,
          },
        });
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
    console.log(
      "Import committed. Re-running updates these rows without duplicates or resetting other schemas.",
    );
  } catch (error) {
    // Do not print connection strings or raw Prisma diagnostics that may contain secrets.
    console.error(
      "Import failed; transaction rolled back.",
      error instanceof Error ? error.name : "UnknownError",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
