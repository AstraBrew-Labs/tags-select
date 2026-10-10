import "server-only";
import { Pool } from "pg";
import { databaseUrl } from "../../../lib/database-config";

const globalPool = globalThis as unknown as { catalogReadPool?: Pool };
export function getCatalogPool() {
  if (!globalPool.catalogReadPool) {
    const pool = new Pool({
      connectionString: databaseUrl(),
      max: 3,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 90_000,
      keepAlive: true,
    });
    pool.on("error", (error) => { console.error("Catalog pool idle error:", error.name); });
    globalPool.catalogReadPool = pool;
  }
  return globalPool.catalogReadPool;
}
