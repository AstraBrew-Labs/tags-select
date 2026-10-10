import type { MetadataRoute } from "next";
import { getSiteUrl } from "./lib/seo-request";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteUrl = await getSiteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: new URL("/sitemap.xml", siteUrl).href,
  };
}
