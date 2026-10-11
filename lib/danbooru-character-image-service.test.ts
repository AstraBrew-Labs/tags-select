import { describe, expect, test } from "bun:test";
import { CHARACTER_IMAGE_CACHE_TTL } from "../app/lib/character-image-types";
import {
  createCharacterImageService,
  handleCharacterImage,
} from "./danbooru-character-image-service";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The blocked-character filter every upstream query must carry. */
const BLOCKED = "-scaramouche_(genshin_impact)";

describe("Danbooru character image proxy", () => {
  test("ordinary tags use the same general-rated query and shared weekly cache", async () => {
    const queries: string[] = [];
    const service = createCharacterImageService({
      fetcher: async (input) => {
        queries.push(new URL(String(input)).searchParams.get("tags")!);
        return response([{ rating: "g", preview_file_url: "https://cdn.donmai.us/a.jpg" }]);
      },
    });
    for (const tag of ["long hair", "forest", "anmi"]) {
      expect((await service.load(tag)).imageUrl).toBe("https://cdn.donmai.us/a.jpg");
      expect((await service.load(tag)).cached).toBe(true);
    }
    expect(queries).toEqual([
      `long_hair rating:g ${BLOCKED}`,
      `forest rating:g ${BLOCKED}`,
      `anmi rating:g ${BLOCKED}`,
    ]);
  });
  test("normalizes tags and requests one post from the official posts endpoint", async () => {
    let requested = "";
    const service = createCharacterImageService({
      fetcher: async (input) => {
        requested = String(input);
        return response([
          {
            id: 1,
            rating: "g",
            file_url: "https://danbooru.donmai.us/data/klee.jpg",
            preview_file_url: "https://danbooru.donmai.us/data/klee-preview.jpg",
          },
        ]);
      },
      now: () => 1_000,
    });
    const result = await service.load(" klee (genshin impact) ");
    expect(result).toEqual({
      tag: "klee_(genshin_impact)",
      imageUrl: "https://danbooru.donmai.us/data/klee-preview.jpg",
      cached: false,
      cachedAt: 1_000,
    });
    const url = new URL(requested);
    expect(url.origin + url.pathname).toBe("https://danbooru.donmai.us/posts.json");
    expect(url.searchParams.get("tags")).toBe(
      `klee_(genshin_impact) rating:g ${BLOCKED}`,
    );
    expect(url.searchParams.get("limit")).toBe("1");
    expect(url.searchParams.get("only")).toContain("preview_file_url");
    // The post's own tag lists must be fetched to double-check the filter.
    expect(url.searchParams.get("only")).toContain("tag_string");
  });
  test("deduplicates concurrent calls and reuses a one-week cached URL", async () => {
    let requests = 0;
    let now = 10_000;
    const service = createCharacterImageService({
      now: () => now,
      fetcher: async () => {
        requests += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return response([{
          rating: "g",
          large_file_url: "https://danbooru.donmai.us/data/a.jpg",
        }]);
      },
    });
    const [first, second] = await Promise.all([
      service.load("klee_(genshin_impact)"),
      service.load("klee_(genshin_impact)"),
    ]);
    expect(requests).toBe(1);
    expect(first.imageUrl).toBe(second.imageUrl);
    expect((await service.load("klee_(genshin_impact)")).cached).toBe(true);
    now += CHARACTER_IMAGE_CACHE_TTL;
    expect((await service.load("klee_(genshin_impact)")).cached).toBe(false);
    expect(requests).toBe(2);
  });
  test("caches a successful no-result response to avoid repeated upstream calls", async () => {
    let requests = 0;
    const service = createCharacterImageService({
      fetcher: async () => {
        requests += 1;
        return response([]);
      },
    });
    expect((await service.load("unknown_character")).imageUrl).toBeNull();
    expect((await service.load("unknown_character")).cached).toBe(true);
    expect(requests).toBe(1);
  });
  test("route validates origin and forbids hidden browser and CDN response caches", async () => {
    const service = createCharacterImageService({
      fetcher: async () => response([{
        rating: "g",
        preview_file_url: "https://danbooru.donmai.us/data/a.jpg",
      }]),
    });
    const denied = await handleCharacterImage(
      new Request("https://site.example/api/danbooru/character-image?tag=a", {
        headers: { Origin: "https://other.example" },
      }),
      { service },
    );
    expect(denied.status).toBe(403);
    const allowed = await handleCharacterImage(
      new Request("https://site.example/api/danbooru/character-image?tag=a"),
      { service },
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("cache-control")).toBe("no-store");
    expect(await allowed.json()).toMatchObject({
      tag: "a",
      imageUrl: "https://danbooru.donmai.us/data/a.jpg",
    });
  });
  test("rejects composite or malformed tag input", async () => {
    const service = createCharacterImageService({ fetcher: async () => response([]) });
    await expect(service.load("a,b")).rejects.toThrow("标签格式无效");
    const invalid = await handleCharacterImage(
      new Request("https://site.example/api/danbooru/character-image?tag=a%2Cb"),
      { service },
    );
    expect(invalid.status).toBe(400);
  });
  test("rejects search operators that could override the character or rating", async () => {
    let requests = 0;
    const service = createCharacterImageService({
      fetcher: async () => { requests++; return response([]); },
    });
    for (const tag of ["rating:e", "*", "-klee", "~klee", "a,b"]) {
      await expect(service.load(tag)).rejects.toThrow("标签格式无效");
    }
    expect(requests).toBe(0);
  });
  test("preserves legal question marks inside work names", async () => {
    let requested = "";
    const service = createCharacterImageService({
      fetcher: async (input) => {
        requested = String(input);
        return response([{
          rating: "g", preview_file_url: "https://cdn.donmai.us/a.jpg",
        }]);
      },
    });
    const result = await service.load("kafuu chino (gochuumon wa usagi desu ka?)");
    expect(result.imageUrl).toBe("https://cdn.donmai.us/a.jpg");
    expect(new URL(requested).searchParams.get("tags")).toBe(
      `kafuu_chino_(gochuumon_wa_usagi_desu_ka?) rating:g ${BLOCKED}`,
    );
  });
  test("maps only verified source names to Danbooru names for image lookup", async () => {
    const queries: string[] = [];
    const service = createCharacterImageService({
      fetcher: async (input) => {
        queries.push(new URL(String(input)).searchParams.get("tags")!);
        return response([{
          rating: "g", preview_file_url: "https://cdn.donmai.us/a.jpg",
        }]);
      },
    });
    const result = await service.load("jouga maya (gochuumon wa usagi desu ka?)");
    expect(result.tag).toBe("jouga_maya");
    expect(result.imageUrl).toBe("https://cdn.donmai.us/a.jpg");
    expect((await service.load("jouga_maya")).cached).toBe(true);
    await service.load("other_(unverified_work?)");
    expect(queries).toEqual([
      `jouga_maya rating:g ${BLOCKED}`,
      `other_(unverified_work?) rating:g ${BLOCKED}`,
    ]);
  });
  test("distinguishes timeout from empty results and never caches timeout", async () => {
    let requests = 0;
    const service = createCharacterImageService({
      fetcher: async () => {
        requests++;
        throw new DOMException("timed out", "TimeoutError");
      },
    });
    const request = new Request("https://site.example/api/danbooru/character-image?tag=a");
    for (let i = 0; i < 2; i++) {
      const failed = await handleCharacterImage(request, { service });
      expect(failed.status).toBe(504);
      expect(failed.headers.get("cache-control")).toBe("no-store");
      expect(await failed.json()).toEqual({
        error: "Danbooru 请求超时，请检查服务端网络或 DANBOORU_IMAGE_PROXY_URL 代理配置。",
      });
    }
    expect(requests).toBe(2);
  });
  test("rejects non-general posts, untrusted URLs and videos", async () => {
    for (const post of [
      { rating: "e", preview_file_url: "https://cdn.donmai.us/a.jpg" },
      { rating: "g", file_url: "javascript:alert(1)" },
      { rating: "g", file_url: "https://other.example/a.jpg" },
      { rating: "g", file_url: "https://cdn.donmai.us/a.mp4" },
    ]) {
      const service = createCharacterImageService({
        fetcher: async () => response([post]),
      });
      expect((await service.load("test_character")).imageUrl).toBeNull();
    }
  });
  test("uses a static preview for video posts", async () => {
    const service = createCharacterImageService({
      fetcher: async () => response([{
        rating: "g",
        file_url: "https://cdn.donmai.us/a.mp4",
        preview_file_url: "https://cdn.donmai.us/180x180/a.jpg",
      }]),
    });
    expect((await service.load("test_character")).imageUrl).toBe(
      "https://cdn.donmai.us/180x180/a.jpg",
    );
  });
  test("upstream failure is not cached and the next call can retry", async () => {
    let requests = 0;
    const service = createCharacterImageService({
      fetcher: async () => {
        requests++;
        return requests === 1 ? response({}, 429) : response([]);
      },
    });
    const request = new Request("https://site.example/api/danbooru/character-image?tag=a");
    const failed = await handleCharacterImage(request, { service });
    expect(failed.status).toBe(502);
    expect(failed.headers.get("cache-control")).toBe("no-store");
    expect((await service.load("a")).cached).toBe(false);
    expect(requests).toBe(2);
  });
  test("route refresh bypasses the server weekly cache and stores the newest URL", async () => {
    let requests = 0;
    let time = 1_000;
    const service = createCharacterImageService({
      now: () => time,
      fetcher: async (_input, init) => {
        expect(init?.cache).toBe("no-store");
        expect(new Headers(init?.headers).get("cache-control")).toBe("no-cache");
        return response([{
          rating: "g", preview_file_url: `https://cdn.donmai.us/${++requests}.jpg`,
        }]);
      },
    });
    const initial = await service.load("a");
    expect(initial.cachedAt).toBe(1_000);
    time = 2_000;
    expect((await service.load("a")).cachedAt).toBe(1_000);
    const fresh = await handleCharacterImage(
      new Request("https://site.example/api/danbooru/character-image?tag=a&refresh=1"),
      { service },
    );
    expect(fresh.headers.get("cache-control")).toBe("no-store");
    expect(fresh.headers.get("x-character-image-cache")).toBe("miss");
    expect(await fresh.json()).toEqual({
      tag: "a", imageUrl: "https://cdn.donmai.us/2.jpg", cached: false, cachedAt: 2_000,
    });
    expect((await service.load("a")).imageUrl).toBe("https://cdn.donmai.us/2.jpg");
    expect(requests).toBe(2);
  });
  test("concurrent refreshes deduplicate and an older request cannot overwrite a newer result", async () => {
    const resolvers: Array<(data: Response) => void> = [];
    const service = createCharacterImageService({
      fetcher: () => new Promise((resolve) => resolvers.push(resolve)),
    });
    const old = service.load("a");
    const fresh = service.load("a", undefined, { refresh: true });
    const duplicate = service.load("a", undefined, { refresh: true });
    expect(resolvers).toHaveLength(2);
    resolvers[1](response([{ rating: "g", preview_file_url: "https://cdn.donmai.us/new.jpg" }]));
    expect((await fresh).imageUrl).toBe("https://cdn.donmai.us/new.jpg");
    expect((await duplicate).imageUrl).toBe("https://cdn.donmai.us/new.jpg");
    resolvers[0](response([{ rating: "g", preview_file_url: "https://cdn.donmai.us/old.jpg" }]));
    await old;
    expect((await service.load("a")).imageUrl).toBe("https://cdn.donmai.us/new.jpg");
  });
  test("blocks preview images whose own tags carry a filtered character", async () => {
    const queries: string[] = [];
    const service = createCharacterImageService({
      fetcher: async (input) => {
        queries.push(new URL(String(input)).searchParams.get("tags")!);
        // The upstream ignored the negative filter and still returned a blocked post.
        return response([{
          rating: "g",
          tag_string: "1girl solo genshin_impact scaramouche_(genshin_impact)",
          tag_string_character: "scaramouche_(genshin_impact)",
          preview_file_url: "https://cdn.donmai.us/a.jpg",
          large_file_url: "https://cdn.donmai.us/a.jpg",
        }]);
      },
    });
    const result = await service.load("genshin impact");
    expect(queries).toEqual([`genshin_impact rating:g ${BLOCKED}`]);
    // A filtered image is reported exactly like an empty upstream result.
    expect(result).toMatchObject({ tag: "genshin_impact", imageUrl: null });
    expect((await service.load("genshin impact")).cached).toBe(true);
  });
  test("recognizes a filtered tag regardless of letter case or position", async () => {
    for (const tag of [
      "Scaramouche_(Genshin_Impact)",
      "scarAMOUCHE_(genshin_impact)",
      "1girl solo scaramouche_(genshin_impact)",
    ]) {
      const service = createCharacterImageService({
        fetcher: async () => response([{
          rating: "g",
          tag_string: tag,
          preview_file_url: "https://cdn.donmai.us/a.jpg",
        }]),
      });
      expect((await service.load("genshin impact")).imageUrl).toBeNull();
    }
  });
  test("keeps serving an ordinary example image while the filter is active", async () => {
    let requested = "";
    const service = createCharacterImageService({
      fetcher: async (input) => {
        requested = String(input);
        return response([{
          rating: "g",
          tag_string: "1girl solo klee_(genshin_impact)",
          preview_file_url: "https://cdn.donmai.us/klee.jpg",
        }]);
      },
    });
    expect((await service.load("klee (genshin impact)")).imageUrl).toBe(
      "https://cdn.donmai.us/klee.jpg",
    );
    expect(new URL(requested).searchParams.get("tags")).toBe(
      `klee_(genshin_impact) rating:g ${BLOCKED}`,
    );
  });
});
