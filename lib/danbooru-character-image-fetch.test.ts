import { describe, expect, test } from "bun:test";
import { ProxyAgent } from "undici";
import {
  characterImageProxyUrl,
  createCharacterImageFetcher,
} from "./danbooru-character-image-fetch";

describe("character image HTTP proxy transport", () => {
  test("uses a dedicated setting first and supports standard proxy variables", () => {
    expect(characterImageProxyUrl({})).toBeNull();
    expect(characterImageProxyUrl({
      DANBOORU_IMAGE_PROXY_URL: " http://127.0.0.1:7892 ",
      HTTPS_PROXY: "https://other.example",
    })).toBe("http://127.0.0.1:7892/");
    expect(characterImageProxyUrl({ HTTPS_PROXY: "http://proxy.example:80" }))
      .toBe("http://proxy.example/");
    expect(characterImageProxyUrl({ http_proxy: "http://proxy.example:8080" }))
      .toBe("http://proxy.example:8080/");
    expect(characterImageProxyUrl({
      DANBOORU_IMAGE_PROXY_URL: "", HTTPS_PROXY: "http://proxy.example",
    })).toBeNull();
  });

  test("invalid proxy URLs are rejected without leaking configuration", () => {
    for (const value of ["socks5://proxy.example", "not-a-proxy-secret"]) {
      expect(() => characterImageProxyUrl({ DANBOORU_IMAGE_PROXY_URL: value }))
        .toThrow("角色图片代理配置无效");
    }
  });

  test("unconfigured requests retain the original fetch options", async () => {
    const options = { method: "GET", signal: AbortSignal.timeout(1_000) };
    let received: RequestInit | undefined;
    const transport = createCharacterImageFetcher({
      proxyUrl: () => null,
      fetcher: async (_input, init) => {
        received = init;
        return Response.json([]);
      },
    });
    await transport.fetch("https://danbooru.donmai.us/posts.json", options);
    expect(received).toBe(options);
  });

  test("reuses a per-request proxy agent and preserves timeout and headers", async () => {
    const agents: unknown[] = [];
    const signal = AbortSignal.timeout(1_000);
    const transport = createCharacterImageFetcher({
      proxyUrl: () => "http://127.0.0.1:7892",
      fetcher: async (_input, init) => {
        agents.push((init as RequestInit & { dispatcher?: unknown }).dispatcher);
        expect(init?.signal).toBe(signal);
        expect(init?.headers).toEqual({ Accept: "application/json" });
        return Response.json([]);
      },
    });
    try {
      for (let i = 0; i < 2; i++) {
        await transport.fetch("https://danbooru.donmai.us/posts.json", {
          signal, headers: { Accept: "application/json" },
        });
      }
      expect(agents[0]).toBeInstanceOf(ProxyAgent);
      expect(agents[0]).toBe(agents[1]);
    } finally {
      await transport.close();
    }
  });
});
