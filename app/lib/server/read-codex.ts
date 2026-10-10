import "server-only";
import { getDb } from "./db";

export async function readCodexGzip(): Promise<Uint8Array> {
  return getDb().$transaction(async (tx) => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const source = await tx.codexImport.findUnique({
      where: { id: "director-codex" }, select: { catalogGzip: true },
    });
    if (!source?.catalogGzip) throw new Error("CodexNotImported");
    return source.catalogGzip;
  }, { maxWait: 10_000, timeout: 60_000 });
}
