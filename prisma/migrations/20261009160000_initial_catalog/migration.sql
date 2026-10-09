-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "novelai_tags";
SET search_path TO "novelai_tags";

-- CreateTable
CREATE TABLE "TagCategory" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TagCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TagGroup" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nameZh" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TagGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "zh" TEXT NOT NULL,
    "en" TEXT NOT NULL,
    "rawZh" TEXT NOT NULL,
    "rawEn" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "popular" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogImport" (
    "id" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "categoryCount" INTEGER NOT NULL,
    "groupCount" INTEGER NOT NULL,
    "tagCount" INTEGER NOT NULL,
    "imageCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TagCategory_sourceKey_key" ON "TagCategory"("sourceKey");

-- CreateIndex
CREATE INDEX "TagGroup_categoryId_sortOrder_idx" ON "TagGroup"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "TagGroup_categoryId_nameZh_key" ON "TagGroup"("categoryId", "nameZh");

-- CreateIndex
CREATE INDEX "Tag_categoryId_sortOrder_idx" ON "Tag"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "Tag_groupId_sortOrder_idx" ON "Tag"("groupId", "sortOrder");

-- CreateIndex
CREATE INDEX "Tag_popular_sortOrder_idx" ON "Tag"("popular", "sortOrder");

-- CreateIndex
CREATE INDEX "Tag_en_idx" ON "Tag"("en");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_groupId_rawZh_key" ON "Tag"("groupId", "rawZh");

-- AddForeignKey
ALTER TABLE "TagGroup" ADD CONSTRAINT "TagGroup_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TagCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "TagCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TagGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

