import { describe, expect, test } from "bun:test";
import { danbooruFixture } from "../app/lib/danbooru-fixtures.test";
import { parseDanbooruInput } from "../app/lib/danbooru-types";
import { DANBOORU_NODES, handleDanbooruSearch } from "./danbooru-search-service";

const input = { query: "白色水手服", limit: 5, show_nsfw: false };
function request(body: unknown = input, signal?: AbortSignal) {
  return new Request("https://local.test/api/danbooru/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
function makeFetcher(
  fn: (url: string, init: RequestInit) => Promise<Response> | Response,
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url, init) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    return fn(call.url, call.init);
  }) as typeof fetch;
  return { fetcher, calls };
}
const good = () => Response.json(danbooruFixture);
const unavailable = () => new Response("Unavailable", { status: 503 });
function waitForAbort(_url: string, init: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    if (init.signal?.aborted) reject(init.signal.reason);
    else
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason), {
        once: true,
      });
  });
}

describe("domestic-first Danbooru proxy", () => {
  test("domestic success uses registration headers, no bearer, no fallback", async () => {
    const { fetcher, calls } = makeFetcher(good);
    const response = await handleDanbooruSearch(request(), {
      apiKey: "test-secret",
      fetcher,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).node).toBe("domestic");
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe(DANBOORU_NODES[0].url);
    expect(init.redirect).toBe("error");
    expect(init.cache).toBe("no-store");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(input);
    const headers = new Headers(init.headers);
    expect(headers.has("authorization")).toBe(false);
    expect(headers.get("X-DanbooruSearch-Client")).toBe("tag-select-astrabrew");
    expect(headers.get("X-DanbooruSearch-Site")).toBe(
      "https://tag-select.astrabrew.cn/",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  test("HTTP failure falls back internationally with server-side bearer", async () => {
    const { fetcher, calls } = makeFetcher((url) =>
      url === DANBOORU_NODES[0].url ? unavailable() : good(),
    );
    const response = await handleDanbooruSearch(request(), {
      apiKey: "test-secret",
      fetcher,
    });
    expect(response.status).toBe(200);
    expect((await response.json()).node).toBe("international");
    expect(calls.map((call) => call.url)).toEqual(
      DANBOORU_NODES.map((node) => node.url),
    );
    expect(new Headers(calls[1].init.headers).get("Authorization")).toBe(
      "Bearer test-secret",
    );
  });
  test("domestic timeout automatically falls back", async () => {
    const { fetcher, calls } = makeFetcher((url, init) =>
      url === DANBOORU_NODES[0].url ? waitForAbort(url, init) : good(),
    );
    const response = await handleDanbooruSearch(request(), {
      apiKey: "test-secret",
      fetcher,
      timeouts: [5, 100],
    });
    expect(response.status).toBe(200);
    expect((await response.json()).node).toBe("international");
    expect(calls).toHaveLength(2);
  });
  test("network, HTML and malformed data failures all fall back", async () => {
    for (const broken of [
      () => {
        throw new Error("network with test-secret");
      },
      () => new Response("<html>not JSON</html>"),
      () => Response.json({ results: [{}] }),
    ]) {
      const { fetcher } = makeFetcher((url) =>
        url === DANBOORU_NODES[0].url ? broken() : good(),
      );
      const response = await handleDanbooruSearch(request(), {
        apiKey: "test-secret",
        fetcher,
      });
      expect((await response.json()).node).toBe("international");
    }
  });
  test("zero results is a successful search, not a reason to fall back", async () => {
    const { fetcher, calls } = makeFetcher(() =>
      Response.json({
        tags_all: "",
        tags_sfw: "",
        keywords: [],
        results: [],
      }),
    );
    const response = await handleDanbooruSearch(request(), { fetcher });
    expect(response.status).toBe(200);
    expect((await response.json()).results).toEqual([]);
    expect(calls).toHaveLength(1);
  });
  test("adult rows are removed and all-tags copy is safe when the switch is off", async () => {
    const mixed = {
      ...danbooruFixture,
      tags_all: "safe_tag, adult_tag",
      tags_sfw: "safe_tag",
      results: [
        danbooruFixture.results[0],
        { ...danbooruFixture.results[0], tag: "adult_tag", nsfw: "1" },
      ],
    };
    const { fetcher } = makeFetcher(() => Response.json(mixed));
    const response = await handleDanbooruSearch(request(), { fetcher });
    const data = await response.json();
    expect(data.results.map((item: { tag: string }) => item.tag)).toEqual([
      "white_serafuku",
    ]);
    expect(data.tags_all).toBe("safe_tag");
    expect(data.tags_all).not.toContain("adult_tag");
  });
  test("adult rows are returned only when the switch is on", async () => {
    const mixed = {
      ...danbooruFixture,
      tags_all: "safe_tag, adult_tag",
      tags_sfw: "safe_tag",
      results: [
        danbooruFixture.results[0],
        { ...danbooruFixture.results[0], tag: "adult_tag", nsfw: "1" },
      ],
    };
    const { fetcher } = makeFetcher(() => Response.json(mixed));
    const response = await handleDanbooruSearch(
      request({ ...input, show_nsfw: true }),
      { fetcher },
    );
    const data = await response.json();
    expect(data.results).toHaveLength(2);
    expect(data.tags_all).toContain("adult_tag");
  });
  test("both time out: retryable 504; both fail: retryable 503", async () => {
    for (const [fn, status] of [
      [waitForAbort, 504],
      [unavailable, 503],
    ] as const) {
      const { fetcher, calls } = makeFetcher(fn);
      const response = await handleDanbooruSearch(request(), {
        apiKey: "test-secret",
        fetcher,
        timeouts: [5, 5],
      });
      expect(response.status).toBe(status);
      expect(calls).toHaveLength(2);
      const message = await response.text();
      expect(message).toContain("重试");
      expect(message).not.toContain("test-secret");
    }
  });
  test("no fallback key never attempts unauthorized international requests", async () => {
    const { fetcher, calls } = makeFetcher(unavailable);
    expect((await handleDanbooruSearch(request(), { fetcher })).status).toBe(503);
    expect(calls).toHaveLength(1);
  });
  test("upstream extra fields, quota notices and secrets are not forwarded", async () => {
    const { fetcher } = makeFetcher(() =>
      Response.json({
        ...danbooruFixture,
        api_key_notice: "test-secret",
        unexpected: "test-secret",
        results: [{ ...danbooruFixture.results[0], token: "test-secret" }],
      }),
    );
    const response = await handleDanbooruSearch(request(), { fetcher });
    expect(await response.text()).not.toContain("test-secret");
  });
  test("client cancellation does not invoke the fallback node", async () => {
    const controller = new AbortController();
    const { fetcher, calls } = makeFetcher((url, init) => {
      controller.abort();
      return waitForAbort(url, init);
    });
    const response = await handleDanbooruSearch(
      request(input, controller.signal),
      { apiKey: "test-secret", fetcher },
    );
    expect(response.status).toBe(499);
    expect(calls).toHaveLength(1);
  });
});

describe("search request validation", () => {
  test("trims queries and enforces strict bounded input", () => {
    expect(parseDanbooruInput({ query: " 白色水手服 " })).toEqual({
      query: "白色水手服",
      limit: 30,
      show_nsfw: false,
    });
    for (const body of [
      null,
      {},
      { query: "" },
      { query: " " },
      { query: "x".repeat(301) },
      { query: "x", limit: 0 },
      { query: "x", limit: 81 },
      { query: "x", limit: 2.5 },
      { query: "x", limit: "5" },
      { query: "x", show_nsfw: "true" },
      { query: "x", url: "https://other.test" },
    ])
      expect(parseDanbooruInput(body)).toBeNull();
  });
  test("invalid requests don't call the external service", async () => {
    const { fetcher, calls } = makeFetcher(good);
    expect((await handleDanbooruSearch(request({}), { fetcher })).status).toBe(
      400,
    );
    const oversized = new Request("https://local.test/api/danbooru/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "x".repeat(5000) }),
    });
    expect((await handleDanbooruSearch(oversized, { fetcher })).status).toBe(400);
    const wrongType = new Request("https://local.test/api/danbooru/search", {
      method: "POST",
      body: "query=x",
    });
    expect((await handleDanbooruSearch(wrongType, { fetcher })).status).toBe(415);
    const crossSite = request();
    crossSite.headers.set("origin", "https://other.test");
    expect((await handleDanbooruSearch(crossSite, { fetcher })).status).toBe(403);
    expect(calls).toHaveLength(0);
  });
});
