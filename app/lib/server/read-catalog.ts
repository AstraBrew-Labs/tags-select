import "server-only";
import { getCatalogPool } from "./catalog-pool";
import { readProjection } from "../../../lib/read-projection";

/** Read the atomic projection without an interactive transaction. */
export async function readCatalogGzip(): Promise<Uint8Array> {
  return readProjection(getCatalogPool(), "catalog");
}
