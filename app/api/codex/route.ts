import { catalogResponse } from "../../lib/server/catalog-response";
import { readCodexGzip } from "../../lib/server/read-codex";

export const maxDuration = 120;

export function GET(request: Request) {
  return catalogResponse(request, "codex", readCodexGzip);
}
