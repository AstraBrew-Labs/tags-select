import { describe, expect, test } from "bun:test";
import type { Pool } from "pg";
import { gzipSync, gunzipSync } from "node:zlib";
import { readProjection, type ProjectionKey } from "./read-projection";

describe("parameterized projection reads", () => {
  test("uses one fixed SELECT per projection and faithfully decodes gzip bytes", async () => {
    const compressed = gzipSync(JSON.stringify({ value: "a".repeat(10_000) }));
    for (const [key, table, id] of [
      ["catalog", "CatalogImport", "loadTags.js"],
      ["codex", "CodexImport", "director-codex"],
      ["adult-codex", "AdultCodexImport", "adult-codex"],
    ]) {
      let queries = 0;
      const pool = {
        async query(text: string, values: string[]) {
          queries++;
          expect(text).toContain(`"novelai_tags"."${table}"`);
          expect(text).toContain('WHERE "id" = $1 LIMIT 1');
          expect(text).not.toMatch(/INSERT|UPDATE|DELETE|BEGIN|COMMIT/);
          expect(values).toEqual([id]);
          return { rows: [{ payload: compressed.toString("base64") }] };
        },
      } as unknown as Pick<Pool, "query">;
      const result = await readProjection(pool, key as ProjectionKey);
      expect(result).toEqual(compressed);
      expect(JSON.parse(gunzipSync(result).toString()).value.length).toBe(10_000);
      expect(queries).toBe(1);
    }
  });
  test("unimported or empty projections fail without returning partial data", async () => {
    for (const rows of [[], [{ payload: null }], [{ payload: "" }]]) {
      const pool = { query: async () => ({ rows }) } as unknown as Pick<Pool, "query">;
      await expect(readProjection(pool, "catalog")).rejects.toThrow("CatalogNotImported");
    }
  });
});
