import "server-only";
import { handleCharacterImage } from "../../../../lib/danbooru-character-image-service";

export async function GET(request: Request) {
  return handleCharacterImage(request);
}
