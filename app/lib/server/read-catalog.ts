import "server-only";
import { getDb } from "./db";

/** Read the projection generated atomically with the normalized source import. */
export async function readCatalogGzip(): Promise<Uint8Array> {
  return getDb().$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const source = await tx.catalogImport.findUnique({
        where: { id: "loadTags.js" },
        select: { catalogGzip: true },
      });
      if (!source?.catalogGzip) throw new Error("CatalogNotImported");
      return source.catalogGzip;
    },
    { maxWait: 10_000, timeout: 60_000 },
  );
}
