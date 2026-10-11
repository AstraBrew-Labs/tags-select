import { handleAiPromptFormat } from "../../../../lib/ai-prompt-formats";
import { AI_CORS_HEADERS } from "../../../../lib/ai-http";

export async function GET(request: Request) {
  return handleAiPromptFormat(request);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: AI_CORS_HEADERS });
}
