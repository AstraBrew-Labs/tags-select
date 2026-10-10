import type { Pool } from "pg";

const projections = {
  catalog: {
    text: `SELECT encode("catalogGzip", 'base64') AS payload
      FROM "novelai_tags"."CatalogImport" WHERE "id" = $1 LIMIT 1`,
    id: "loadTags.js",
  },
  codex: {
    text: `SELECT encode("catalogGzip", 'base64') AS payload
      FROM "novelai_tags"."CodexImport" WHERE "id" = $1 LIMIT 1`,
    id: "director-codex",
  },
  "adult-codex": {
    text: `SELECT encode("catalogGzip", 'base64') AS payload
      FROM "novelai_tags"."AdultCodexImport" WHERE "id" = $1 LIMIT 1`,
    id: "adult-codex",
  },
};
export type ProjectionKey = keyof typeof projections;

export async function readProjection(pool: Pick<Pool, "query">, key: ProjectionKey): Promise<Uint8Array> {
  const projection = projections[key];
  // The SQL and table identifiers are fixed; only the row ID is bound. Reading
  // large snapshots directly avoids ORM serialization of the entire payload.
  const { rows } = await pool.query<{ payload: string | null }>(projection.text, [projection.id]);
  const payload = rows[0]?.payload;
  if (!payload) throw new Error("CatalogNotImported");
  return Buffer.from(payload, "base64");
}
