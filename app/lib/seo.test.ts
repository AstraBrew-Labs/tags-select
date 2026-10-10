import { describe, expect, test } from "bun:test";
import {
  OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_TITLE,
  configuredSiteUrl, resolveRequestSiteUrl, resolveSiteUrl, siteMetadata, siteStructuredData,
} from "./seo";
import manifest from "../manifest";

describe("search and sharing metadata", () => {
  test("uses the supplied origin across metadata and structured data", () => {
    for (const origin of ["http://localhost:3107", "https://example.com"]) {
      const url = resolveSiteUrl(origin);
      expect(siteMetadata(url).metadataBase).toEqual(url);
      expect(siteMetadata(url).alternates?.canonical).toBe("/");
      expect(siteStructuredData(url)["@graph"][0].url).toBe(url.href);
      expect(siteStructuredData(url)["@graph"][1].image)
        .toBe(new URL(OG_IMAGE.url, url).href);
    }
  });
  test("development follows actual ports and LAN hosts even with a production URL configured", () => {
    const env = { NODE_ENV: "development", SITE_URL: "https://production.example" };
    expect(configuredSiteUrl(env)).toBeUndefined();
    for (const host of ["localhost:3107", "127.0.0.1:3008", "192.168.1.20:3001", "[::1]:3012"]) {
      expect(resolveRequestSiteUrl(new Headers({ host }), env).href).toBe(`http://${host}/`);
    }
  });
  test("production can fix its canonical origin or follow the current deployment request", () => {
    const request = new Headers({
      host: "preview.example:8443", "x-forwarded-proto": "https",
      "x-forwarded-host": "untrusted.example",
    });
    expect(resolveRequestSiteUrl(request, { NODE_ENV: "production" }).href)
      .toBe("https://preview.example:8443/");
    expect(resolveRequestSiteUrl(request, { NODE_ENV: "production", SITE_URL: " " }).href)
      .toBe("https://preview.example:8443/");
    expect(resolveRequestSiteUrl(request, {
      NODE_ENV: "production", SITE_URL: " https://production.example/ ",
    }).href).toBe("https://production.example/");
    expect(resolveRequestSiteUrl(new Headers({ host: "localhost:4000" }), {
      NODE_ENV: "production",
    }).href).toBe("http://localhost:4000/");
  });
  test("rejects invalid request origins instead of inventing a domain", () => {
    const env = { NODE_ENV: "development" };
    expect(() => resolveRequestSiteUrl(new Headers(), env)).toThrow();
    for (const host of ["user@example.com", "example.com/path", "example.com?x", "a,b", "a\\b", "a b"]) {
      expect(() => resolveRequestSiteUrl(new Headers({ host }), env)).toThrow();
    }
    for (const protocol of ["ftp", "https,http", "javascript"]) {
      expect(() => resolveRequestSiteUrl(new Headers({
        host: "example.com", "x-forwarded-proto": protocol,
      }), env)).toThrow();
    }
  });
  test("validates deployment origin without generating credential or query URLs", () => {
    expect(resolveSiteUrl("https://example.com/").href).toBe("https://example.com/");
    expect(resolveSiteUrl("http://localhost:3000").href).toBe("http://localhost:3000/");
    for (const value of [
      "not a url", "ftp://example.com", "https://user:secret@example.com",
      "https://example.com/tool", "https://example.com/?query=x", "https://example.com/#tags",
    ]) expect(() => resolveSiteUrl(value)).toThrow();
  });
  test("describes both discovery and remote search with a static large sharing image", () => {
    const metadata = siteMetadata(resolveSiteUrl("http://localhost:3107"));
    expect(metadata.title).toEqual({
      default: SITE_TITLE, template: `%s | ${SITE_NAME}`,
    });
    expect(SITE_DESCRIPTION).toContain("Danbooru");
    expect(SITE_DESCRIPTION).toContain("非官方");
    expect(metadata.openGraph).toMatchObject({
      url: "/", locale: "zh_CN", siteName: SITE_NAME, images: [OG_IMAGE],
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      images: [{ url: OG_IMAGE.url, alt: OG_IMAGE.alt }],
    });
    expect(OG_IMAGE.width).toBe(1200);
    expect(OG_IMAGE.height).toBe(630);
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });
  test("structured data accurately describes the tool, without invented ratings or search URLs", () => {
    const siteUrl = resolveSiteUrl("http://localhost:3107");
    const schema = siteStructuredData(siteUrl);
    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@graph"].map((item) => item["@type"]))
      .toEqual(["WebSite", "WebApplication"]);
    expect(schema["@graph"][1]).toMatchObject({
      name: SITE_NAME, url: siteUrl.href,
      image: new URL(OG_IMAGE.url, siteUrl).href,
      operatingSystem: "Web Browser",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "CNY" },
    });
    expect(JSON.stringify(schema)).not.toContain("SearchAction");
    expect(JSON.stringify(schema)).not.toContain("aggregateRating");
  });
  test("manifest uses correctly sized icons with a dedicated maskable asset", () => {
    expect(manifest()).toMatchObject({
      id: "/", start_url: "/", scope: "/", name: SITE_NAME, lang: "zh-CN",
      display: "browser",
    });
    expect(manifest().icons).toEqual([
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });
});
