import { describe, expect, test } from "bun:test";
import {
  handleDanbooruRecommendations,
} from "./danbooru-recommendation-service";

const artists = {
  results: [
    {
      artist: "artist_one",
      cooc_count: 8,
      post_count: 120,
      sources: ["white_serafuku"],
      top_tags: ["white_serafuku", "long_hair"],
    },
  ],
};
const related = (tag: string, category = "General") => ({
  results: [
    {
      tag,
      cn_name: `${tag}中文`,
      category,
      sources: ["white_serafuku"],
      wiki: `${tag}说明`,
    },
  ],
});
function request(body: unknown) {
  return new Request("https://local.test/api/danbooru/recommendations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function fetcherFor(
  fn: (url: string, init: RequestInit) => Response | Promise<Response>,
) {
  const calls: string[] = [];
  const fetcher = (async (url, init) => {
    calls.push(String(url));
    return fn(String(url), init ?? {});
  }) as typeof fetch;
  return { fetcher, calls };
}
const validInput = {
  tags: ["white_serafuku"],
  categories: ["General"],
  show_nsfw: false,
};

describe("Danbooru recommendation proxy", () => {
  test("requests artists, same-category and broad related data", async () => {
    const { fetcher, calls } = fetcherFor((url) => {
      if (url.endsWith("/artists")) return Response.json(artists);
      if (calls.filter((item) => item.endsWith("/related")).length === 1)
        return Response.json(related("same_tag", "General"));
      return Response.json(related("related_tag", "Character"));
    });
    const response = await handleDanbooruRecommendations(request(validInput), {
      fetcher,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.artists[0].artist).toBe("artist_one");
    expect(data.sameCategory[0].tag).toBe("same_tag");
    expect(data.related[0].tag).toBe("related_tag");
    expect(calls.filter((url) => url.endsWith("/related"))).toHaveLength(2);
    expect(new Set(calls.map((url) => new URL(url).origin)).size).toBe(1);
  });
  test("passes the whole cross-search combination to all three upstream requests", async () => {
    const bodies: Record<string, unknown>[] = [];
    const { fetcher } = fetcherFor((url, init) => {
      bodies.push(JSON.parse(String(init.body)));
      return Response.json(url.endsWith("/artists") ? artists : related("combined_tag"));
    });
    const input = {
      tags: ["white_serafuku", "another_character"],
      categories: ["General", "Character"],
      show_nsfw: false,
    };
    const response = await handleDanbooruRecommendations(request(input), { fetcher });
    expect(response.status).toBe(200);
    expect(bodies).toHaveLength(3);
    for (const body of bodies) {
      expect(body.tags).toEqual(input.tags);
      expect(body.show_nsfw).toBe(false);
    }
    expect(bodies.filter((body) => Array.isArray(body.target_categories)))
      .toEqual([expect.objectContaining({ target_categories: input.categories })]);
  });
  test("partial mode keeps the buckets that answered when a sibling fails", async () => {
    const { fetcher } = fetcherFor((url, init) => {
      if (url.endsWith("/artists")) return new Response("busy", { status: 503 });
      const body = JSON.parse(String(init.body));
      const scoped = Array.isArray(body.target_categories);
      return Response.json(related(scoped ? "same_tag" : "broad_tag", scoped ? "General" : "Character"));
    });
    const response = await handleDanbooruRecommendations(request(validInput), {
      fetcher, partial: true,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    // Artists is empty but both related buckets survive the failed sibling.
    expect(data.artists).toEqual([]);
    expect(data.sameCategory.map((item: { tag: string }) => item.tag)).toEqual(["same_tag"]);
    expect(data.related.map((item: { tag: string }) => item.tag)).toEqual(["broad_tag"]);
    expect(data.nodes.related).toBe("domestic");
  });
  test("partial mode still fails when every bucket fails", async () => {
    const { fetcher } = fetcherFor(() => new Response("busy", { status: 503 }));
    const response = await handleDanbooruRecommendations(request(validInput), {
      fetcher, partial: true,
    });
    expect(response.status).toBe(503);
  });
  test("drops malformed rows instead of voiding the whole bucket", async () => {
    const { fetcher } = fetcherFor((url) => {
      if (url.endsWith("/artists")) return Response.json({
        results: [
          { artist: "good_artist", cooc_count: 3, post_count: 9, sources: ["x"], top_tags: [] },
          { artist: "float_count", cooc_count: 1.5, post_count: 9, sources: ["x"], top_tags: [] },
          { post_count: 9, sources: ["x"], top_tags: [] },
          "not-an-object",
        ],
      });
      return Response.json(related("kept"));
    });
    const response = await handleDanbooruRecommendations(request(validInput), { fetcher });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.artists.map((item: { artist: string }) => item.artist)).toEqual(["good_artist"]);
    expect(data.sameCategory.map((item: { tag: string }) => item.tag)).toEqual(["kept"]);
  });
  test("falls back to international node for failed recommendation calls", async () => {
    const { fetcher, calls } = fetcherFor((url) => {
      if (url.includes("sakizuki-danboorusearchonline"))
        return new Response("busy", { status: 503 });
      if (url.endsWith("/artists")) return Response.json(artists);
      return Response.json(related("fallback_tag"));
    });
    const response = await handleDanbooruRecommendations(request(validInput), {
      apiKey: "test-secret",
      fetcher,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.nodes.artists).toBe("international");
    expect(data.nodes.sameCategory).toBe("international");
    expect(data.nodes.related).toBe("international");
    expect(calls.some((url) => url.includes(".hf.space"))).toBe(true);
  });
  test("removes duplicate broad related rows already shown as same-category", async () => {
    const { fetcher } = fetcherFor((url) => {
      if (url.endsWith("/artists")) return Response.json(artists);
      return Response.json({
        results: [
          related("duplicate").results[0],
          related("unique", "Character").results[0],
        ],
      });
    });
    const response = await handleDanbooruRecommendations(request(validInput), {
      fetcher,
    });
    const data = await response.json();
    expect(data.sameCategory.map((item: { tag: string }) => item.tag)).toEqual([
      "duplicate",
      "unique",
    ]);
    expect(data.related).toEqual([]);
  });
  test("rejects invalid input and never calls upstream", async () => {
    const { fetcher, calls } = fetcherFor(() => Response.json(artists));
    for (const body of [
      {},
      { ...validInput, tags: [] },
      { ...validInput, tags: Array(9).fill("tag") },
      { ...validInput, categories: ["Unknown"] },
      { ...validInput, show_nsfw: "false" },
    ]) {
      expect(
        (await handleDanbooruRecommendations(request(body), { fetcher }))
          .status,
      ).toBe(400);
    }
    expect(calls).toHaveLength(0);
  });
  test("does not expose bearer credentials in failure responses", async () => {
    const { fetcher } = fetcherFor(() => new Response("busy", { status: 503 }));
    const response = await handleDanbooruRecommendations(request(validInput), {
      apiKey: "test-secret",
      fetcher,
    });
    expect(await response.text()).not.toContain("test-secret");
  });
});
