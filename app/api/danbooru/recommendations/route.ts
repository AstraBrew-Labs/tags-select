import "server-only";
import { handleDanbooruRecommendations } from "../../../../lib/danbooru-recommendation-service";

export async function POST(request: Request) {
  return handleDanbooruRecommendations(request, {
    apiKey: process.env.DANBOORU_SEARCH_API_KEY,
  });
}
