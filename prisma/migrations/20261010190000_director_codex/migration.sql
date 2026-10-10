-- Independent tables: do not change the existing tag catalog or other schemas.
CREATE TABLE "novelai_tags"."CodexCategory" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "CodexCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "novelai_tags"."CodexEntry" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "anchor" TEXT NOT NULL,
    "groups" JSONB NOT NULL,
    "notes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL,
    CONSTRAINT "CodexEntry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "novelai_tags"."CodexImport" (
    "id" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entryCount" INTEGER NOT NULL,
    "omittedCount" INTEGER NOT NULL,
    "catalogGzip" BYTEA NOT NULL,
    CONSTRAINT "CodexImport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CodexEntry_anchor_key" ON "novelai_tags"."CodexEntry"("anchor");
CREATE INDEX "CodexEntry_categoryId_sortOrder_idx" ON "novelai_tags"."CodexEntry"("categoryId", "sortOrder");
ALTER TABLE "novelai_tags"."CodexEntry"
    ADD CONSTRAINT "CodexEntry_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "novelai_tags"."CodexCategory"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
