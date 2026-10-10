import { catalogResponse } from "../../lib/server/catalog-response";
import { readAdultCodexGzip } from "../../lib/server/read-adult-codex";

export const maxDuration = 120;

export function GET(request: Request) {
  return catalogResponse(request, "adult-codex", readAdultCodexGzip);
}
