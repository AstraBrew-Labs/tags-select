import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { Prisma } from "../generated/prisma/client";
import { createPrismaClient } from "../lib/prisma-client";
import { isCodexCatalog } from "../app/lib/director-codex";
import { isGeneralCodexContent, parseCodexSource } from "./parse-codex-source";

// Saved HTML is parsed as data, never imported/evaluated or executed.
const htmlPath = process.env.CODEX_HTML;
const sourcePath = resolve(process.env.CODEX_SOURCE ?? "data/director-codex.json");
if (htmlPath) {
  const extracted = parseCodexSource(await readFile(resolve(htmlPath), "utf8"), new Date().toISOString());
  if (!isCodexCatalog(extracted)) throw new Error("法典提取结果结构不正确。");
  await writeFile(sourcePath, `${JSON.stringify(extracted, null, 2)}\n`);
}
const raw = await readFile(sourcePath, "utf8");
const data: unknown = JSON.parse(raw);
if (!isCodexCatalog(data) || !data.entries.length) throw new Error("法典数据结构不正确，停止导入。");
const categoryNames = new Map(data.categories.map((item) => [item.id, item.title]));
for (const entry of data.entries) {
  if (!isGeneralCodexContent([
    categoryNames.get(entry.categoryId), entry.title,
    ...entry.groups.flatMap((group) => [group.label, group.prompt]), ...entry.notes,
  ].join("\n"))) throw new Error("数据包含超出收录范围的条目，请重新提取审核。");
}
const dryRun = process.argv.includes("--dry-run");
console.log({
  categories: data.categories.length, entries: data.entries.length,
  groups: data.entries.reduce((sum, entry) => sum + entry.groups.length, 0),
  omitted: data.source.omittedCount, edition: data.source.edition, dryRun,
});
if (!dryRun) {
  const db = createPrismaClient();
  const importedAt = new Date();
  const projection = { ...data, source: { ...data.source, importedAt: importedAt.toISOString() } };
  try {
    await db.$transaction(async (tx) => {
      const categories = data.categories.map(({ id, title }, sortOrder) => ({ id, title, sortOrder }));
      await tx.$executeRaw`
        INSERT INTO "novelai_tags"."CodexCategory" ("id", "title", "sortOrder")
        SELECT "id", "title", "sortOrder"
        FROM jsonb_to_recordset(${JSON.stringify(categories)}::jsonb) AS x("id" text, "title" text, "sortOrder" integer)
        ON CONFLICT ("id") DO UPDATE SET "title" = EXCLUDED."title", "sortOrder" = EXCLUDED."sortOrder"
      `;
      for (let offset = 0; offset < data.entries.length; offset += 300) {
        const batch = data.entries.slice(offset, offset + 300).map((entry, index) => ({ ...entry, sortOrder: offset + index }));
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "novelai_tags"."CodexEntry" ("id", "categoryId", "title", "anchor", "groups", "notes", "sortOrder")
          SELECT "id", "categoryId", "title", "anchor", "groups", "notes", "sortOrder"
          FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) AS x("id" text, "categoryId" text, "title" text, "anchor" text, "groups" jsonb, "notes" text[], "sortOrder" integer)
          ON CONFLICT ("id") DO UPDATE SET "categoryId" = EXCLUDED."categoryId", "title" = EXCLUDED."title", "anchor" = EXCLUDED."anchor",
            "groups" = EXCLUDED."groups", "notes" = EXCLUDED."notes", "sortOrder" = EXCLUDED."sortOrder"
        `);
      }
      // This snapshot owns only the Codex tables. Remove obsolete Codex records,
      // including entries excluded by a newly reviewed source; never touch tags.
      await tx.codexEntry.deleteMany({ where: { id: { notIn: data.entries.map((entry) => entry.id) } } });
      await tx.codexCategory.deleteMany({ where: { id: { notIn: data.categories.map((category) => category.id) } } });
      const snapshot = {
        sourceUrl: data.source.url, sourceHash: createHash("sha256").update(raw).digest("hex"),
        edition: data.source.edition, capturedAt: new Date(data.source.capturedAt),
        importedAt, entryCount: data.entries.length, omittedCount: data.source.omittedCount,
        catalogGzip: gzipSync(JSON.stringify(projection)),
      };
      await tx.codexImport.upsert({
        where: { id: "director-codex" },
        create: { id: "director-codex", ...snapshot }, update: snapshot,
      });
    }, { maxWait: 10_000, timeout: 120_000 });
    console.log("Codex import committed. Existing tag catalog was not modified.");
  } catch (error) {
    console.error("Codex import failed; transaction rolled back.", error instanceof Error ? error.name : "UnknownError");
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}
