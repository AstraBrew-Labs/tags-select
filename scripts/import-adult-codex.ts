import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { Prisma } from "../generated/prisma/client";
import { createPrismaClient } from "../lib/prisma-client";
import { isAdultCodexCatalog } from "../app/lib/adult-codex";

const sourcePath = resolve(process.env.ADULT_CODEX_SOURCE ?? "data/adult-codex.json");
const raw = await readFile(sourcePath, "utf8");
const value: unknown = JSON.parse(raw);
if (!isAdultCodexCatalog(value) || !value.entries.length) {
  throw new Error("成人法典数据结构不正确，停止导入。");
}
const data = value;
const dryRun = process.argv.includes("--dry-run");
const groupCount = data.entries.reduce((sum, entry) => sum + entry.groups.length, 0);

console.log({
  volumes: data.volumes.length,
  categories: data.categories.length,
  entries: data.entries.length,
  groups: groupCount,
  omitted: data.source.omittedCount,
  capturedAt: data.source.capturedAt,
  dryRun,
});

if (!dryRun) {
  const db = createPrismaClient();
  const importedAt = new Date();
  const projection = {
    ...data,
    source: { ...data.source, importedAt: importedAt.toISOString() },
  };
  try {
    await db.$transaction(async (tx) => {
      const volumes = data.volumes.map(({ id, label, title, url }, sortOrder) => ({
        id, label, title, url, sortOrder,
      }));
      await tx.$executeRaw`
        INSERT INTO "novelai_tags"."AdultCodexVolume" ("id", "label", "title", "url", "sortOrder")
        SELECT "id", "label", "title", "url", "sortOrder"
        FROM jsonb_to_recordset(${JSON.stringify(volumes)}::jsonb)
          AS x("id" text, "label" text, "title" text, "url" text, "sortOrder" integer)
        ON CONFLICT ("id") DO UPDATE SET
          "label" = EXCLUDED."label", "title" = EXCLUDED."title",
          "url" = EXCLUDED."url", "sortOrder" = EXCLUDED."sortOrder"
      `;

      const categories = data.categories.map(({ id, volumeId, title }, sortOrder) => ({
        id, volumeId, title, sortOrder,
      }));
      await tx.$executeRaw`
        INSERT INTO "novelai_tags"."AdultCodexCategory" ("id", "volumeId", "title", "sortOrder")
        SELECT "id", "volumeId", "title", "sortOrder"
        FROM jsonb_to_recordset(${JSON.stringify(categories)}::jsonb)
          AS x("id" text, "volumeId" text, "title" text, "sortOrder" integer)
        ON CONFLICT ("id") DO UPDATE SET
          "volumeId" = EXCLUDED."volumeId", "title" = EXCLUDED."title",
          "sortOrder" = EXCLUDED."sortOrder"
      `;

      for (let offset = 0; offset < data.entries.length; offset += 300) {
        const batch = data.entries.slice(offset, offset + 300).map((entry, index) => ({
          ...entry,
          sortOrder: offset + index,
        }));
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "novelai_tags"."AdultCodexEntry"
            ("id", "volumeId", "categoryId", "title", "anchor", "groups", "notes", "sortOrder")
          SELECT "id", "volumeId", "categoryId", "title", "anchor", "groups", "notes", "sortOrder"
          FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
            AS x("id" text, "volumeId" text, "categoryId" text, "title" text,
              "anchor" text, "groups" jsonb, "notes" text[], "sortOrder" integer)
          ON CONFLICT ("id") DO UPDATE SET
            "volumeId" = EXCLUDED."volumeId", "categoryId" = EXCLUDED."categoryId",
            "title" = EXCLUDED."title", "anchor" = EXCLUDED."anchor",
            "groups" = EXCLUDED."groups", "notes" = EXCLUDED."notes",
            "sortOrder" = EXCLUDED."sortOrder"
        `);
      }

      const entryIds = data.entries.map((entry) => entry.id);
      const categoryIds = data.categories.map((category) => category.id);
      const volumeIds = data.volumes.map((volume) => volume.id);
      await tx.adultCodexEntry.deleteMany({ where: { id: { notIn: entryIds } } });
      await tx.adultCodexCategory.deleteMany({ where: { id: { notIn: categoryIds } } });
      await tx.adultCodexVolume.deleteMany({ where: { id: { notIn: volumeIds } } });

      await tx.adultCodexImport.upsert({
        where: { id: "adult-codex" },
        create: {
          id: "adult-codex",
          sourceUrls: data.volumes.map((volume) => volume.url),
          sourceHash: createHash("sha256").update(raw).digest("hex"),
          capturedAt: new Date(data.source.capturedAt),
          importedAt,
          volumeCount: data.volumes.length,
          categoryCount: data.categories.length,
          entryCount: data.entries.length,
          groupCount,
          omittedCount: data.source.omittedCount,
          catalogGzip: gzipSync(JSON.stringify(projection)),
        },
        update: {
          sourceUrls: data.volumes.map((volume) => volume.url),
          sourceHash: createHash("sha256").update(raw).digest("hex"),
          capturedAt: new Date(data.source.capturedAt),
          importedAt,
          volumeCount: data.volumes.length,
          categoryCount: data.categories.length,
          entryCount: data.entries.length,
          groupCount,
          omittedCount: data.source.omittedCount,
          catalogGzip: gzipSync(JSON.stringify(projection)),
        },
      });
    }, { maxWait: 10_000, timeout: 120_000 });
    console.log("Adult codex import committed. Existing tag and general codex data was not modified.");
  } catch (error) {
    console.error(
      "Adult codex import failed; transaction rolled back.",
      error instanceof Error ? error.name : "UnknownError",
    );
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
