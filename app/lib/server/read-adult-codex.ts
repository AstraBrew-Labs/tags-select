import "server-only";
import { getDb } from "./db";

export async function readAdultCodexGzip(): Promise<Uint8Array> {
  // This endpoint exposes only a single SELECT. Avoid an interactive
  // transaction here because Neon can take longer than Prisma's default
  // commit timeout to stream the large compressed snapshot through the pooler.
  const source = await getDb().adultCodexImport.findUnique({
    where: { id: "adult-codex" },
    select: { catalogGzip: true },
  });
  if (!source?.catalogGzip) throw new Error("AdultCodexNotImported");
  return source.catalogGzip;
}
