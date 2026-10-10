import "server-only";
import { handleDanbooruSearch } from "../../../../lib/danbooru-search-service";

// POST searches upstream; it never writes to the application's database.
export async function POST(request: Request) {
  return handleDanbooruSearch(request, {
    apiKey: process.env.DANBOORU_SEARCH_API_KEY,
  });
}
