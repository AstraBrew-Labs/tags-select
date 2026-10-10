import { ProxyAgent } from "undici";

type ProxyEnvironment = Record<string, string | undefined>;

export function characterImageProxyUrl(env: ProxyEnvironment) {
  const value = (
    env.DANBOORU_IMAGE_PROXY_URL ??
    env.HTTPS_PROXY ??
    env.https_proxy ??
    env.HTTP_PROXY ??
    env.http_proxy ??
    ""
  ).trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol)) throw new Error();
    return url.href;
  } catch {
    // Proxy credentials and infrastructure details must not reach the client.
    throw new Error("角色图片代理配置无效，请使用 HTTP 或 HTTPS 代理地址。");
  }
}

export function createCharacterImageFetcher({
  proxyUrl = () => characterImageProxyUrl(process.env),
  fetcher = fetch,
}: {
  proxyUrl?: () => string | null;
  fetcher?: typeof fetch;
} = {}) {
  let agent: ProxyAgent | undefined;
  let currentProxy: string | null = null;

  const fetchImage: typeof fetch = async (input, init) => {
    const nextProxy = proxyUrl();
    if (nextProxy !== currentProxy) {
      if (typeof agent?.close === "function")
        void agent.close().catch(() => {});
      agent = nextProxy ? new ProxyAgent(nextProxy) : undefined;
      currentProxy = nextProxy;
    }
    if (!agent) return fetcher(input, init);
    // Per-request dispatcher: do not reroute database, catalog or search traffic.
    const options: RequestInit & { dispatcher: ProxyAgent } = {
      ...init,
      dispatcher: agent,
    };
    return fetcher(input, options);
  };

  return {
    fetch: fetchImage,
    close: async () => {
      if (typeof agent?.close === "function") await agent.close();
      agent = undefined;
      currentProxy = null;
    },
  };
}

export const characterImageFetcher = createCharacterImageFetcher();
