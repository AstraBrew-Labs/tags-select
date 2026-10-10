import "server-only";
import { getCatalogPool } from "./catalog-pool";
import { readProjection } from "../../../lib/read-projection";

export async function readAdultCodexGzip(): Promise<Uint8Array> {
  return readProjection(getCatalogPool(), "adult-codex");
}
