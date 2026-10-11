import { handleAiTagSearch, AI_CORS_HEADERS } from "../../../../lib/ai-http";
import { searchAiTags } from "../../../../lib/ai-tag-service";

export async function GET(request: Request) {
  return handleAiTagSearch(request, searchAiTags);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: AI_CORS_HEADERS });
}
