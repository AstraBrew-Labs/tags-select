import { handleAiMcp } from "../../../../lib/ai-mcp";
import { searchAiTags } from "../../../../lib/ai-tag-service";

export async function POST(request: Request) { return handleAiMcp(request, searchAiTags); }
export async function GET(request: Request) { return handleAiMcp(request, searchAiTags); }
export async function DELETE(request: Request) { return handleAiMcp(request, searchAiTags); }
