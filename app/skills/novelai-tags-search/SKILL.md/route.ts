import { aiDocumentResponse } from "../../../../lib/ai-document-response";
export function GET(request: Request) { return aiDocumentResponse(request, "skill"); }
