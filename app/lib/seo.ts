import type { Metadata } from "next";

export const SITE_NAME = "NovelAI Tags 选择器";
export const SITE_TITLE = `${SITE_NAME} - 中文标签搜索与绘画提示词工具`;
export const SITE_DESCRIPTION =
  "查找 NovelAI 绘画中英文 Tags，按分类浏览标签、搜索 Danbooru 标签、查询提示词释义，支持加减权、收藏与一键复制，并提供所长法典配方和标签参考图。非官方社区辅助工具。";
export const OG_IMAGE = {
  url: "/og/novelai-tags.png",
  width: 1200,
  height: 630,
  alt: "NovelAI Tags 选择器：中文标签搜索、提示词组合与一键复制",
  type: "image/png",
};

export function resolveSiteUrl(value: string) {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash
  ) throw new Error("SITE_URL 必须是无路径、凭据或查询参数的 HTTP(S) 站点地址。");
  return url;
}

type SiteEnvironment = { NODE_ENV?: string; SITE_URL?: string };

export function configuredSiteUrl(env: SiteEnvironment = process.env) {
  const value = env.SITE_URL?.trim();
  return env.NODE_ENV !== "development" && value ? resolveSiteUrl(value) : undefined;
}

export function resolveRequestSiteUrl(
  requestHeaders: Pick<Headers, "get">,
  env: SiteEnvironment = process.env,
) {
  const configured = configuredSiteUrl(env);
  if (configured) return configured;

  // Use Host, not arbitrary forwarded hosts. Proxies must preserve Host or set SITE_URL.
  const host = requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  if (!host || /[\s,/@\\?#]/.test(host) || !["http", "https"].includes(protocol)) {
    throw new Error("无法从请求确定合法的 SEO 站点地址。");
  }
  return resolveSiteUrl(`${protocol}://${host}`);
}

const commonMetadata: Metadata = {
  title: { default: SITE_TITLE, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  category: "绘画提示词工具",
  formatDetection: { telephone: false, address: false, email: false },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
    siteName: SITE_NAME,
    locale: "zh_CN",
    type: "website",
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
  },
};

export function siteMetadata(siteUrl: URL): Metadata {
  return { ...commonMetadata, metadataBase: siteUrl };
}

export function siteStructuredData(siteUrl: URL) {
  const url = siteUrl.href;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${url}#website`,
        url,
        name: SITE_NAME,
        alternateName: "NovelAI Tags Selector",
        description: SITE_DESCRIPTION,
        inLanguage: "zh-CN",
      },
      {
        "@type": "WebApplication",
        "@id": `${url}#application`,
        url,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Web Browser",
        inLanguage: "zh-CN",
        isAccessibleForFree: true,
        image: new URL(OG_IMAGE.url, siteUrl).href,
        offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
        featureList: [
          "中英文绘画标签分类浏览",
          "Danbooru 标签搜索",
          "提示词释义查找",
          "提示词加减权与一键复制",
          "标签收藏与参考图",
          "所长法典配方查找",
        ],
        isPartOf: { "@id": `${url}#website` },
      },
    ],
  };
}
