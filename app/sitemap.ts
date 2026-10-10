import type { MetadataRoute } from "next";
import { getSiteUrl } from "./lib/seo-request";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = await getSiteUrl();
  // Tabs are not independent routes; do not advertise nonexistent indexable pages.
  return [{ url: siteUrl.href }];
}
