-- Independent adult codex tables. They do not modify the tag catalog or the
-- existing general director codex tables.
CREATE TABLE "novelai_tags"."AdultCodexVolume" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "AdultCodexVolume_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "novelai_tags"."AdultCodexCategory" (
    "id" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "AdultCodexCategory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "novelai_tags"."AdultCodexEntry" (
    "id" TEXT NOT NULL,
    "volumeId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "groups" JSONB NOT NULL,
    "notes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "AdultCodexEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "novelai_tags"."AdultCodexImport" (
    "id" TEXT NOT NULL,
    "sourceUrls" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "volumeCount" INTEGER NOT NULL,
    "categoryCount" INTEGER NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "groupCount" INTEGER NOT NULL,
    "omittedCount" INTEGER NOT NULL,
    "catalogGzip" BYTEA NOT NULL,
    CONSTRAINT "AdultCodexImport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdultCodexCategory_volumeId_sortOrder_idx"
    ON "novelai_tags"."AdultCodexCategory"("volumeId", "sortOrder");
CREATE INDEX "AdultCodexEntry_volumeId_sortOrder_idx"
    ON "novelai_tags"."AdultCodexEntry"("volumeId", "sortOrder");
CREATE INDEX "AdultCodexEntry_categoryId_sortOrder_idx"
    ON "novelai_tags"."AdultCodexEntry"("categoryId", "sortOrder");

ALTER TABLE "novelai_tags"."AdultCodexCategory"
    ADD CONSTRAINT "AdultCodexCategory_volumeId_fkey"
    FOREIGN KEY ("volumeId") REFERENCES "novelai_tags"."AdultCodexVolume"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "novelai_tags"."AdultCodexEntry"
    ADD CONSTRAINT "AdultCodexEntry_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "novelai_tags"."AdultCodexCategory"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
