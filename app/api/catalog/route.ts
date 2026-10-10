import { catalogResponse } from "../../lib/server/catalog-response";
import { readCatalogGzip } from "../../lib/server/read-catalog";

export const maxDuration = 120;

export function GET(request: Request) {
  return catalogResponse(request, "catalog", readCatalogGzip);
}
