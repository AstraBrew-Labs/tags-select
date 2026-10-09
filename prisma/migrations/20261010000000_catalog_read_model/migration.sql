-- Small, import-owned read model avoids large-result transport/decoding costs.
ALTER TABLE "novelai_tags"."CatalogImport" ADD COLUMN "catalogGzip" BYTEA;
