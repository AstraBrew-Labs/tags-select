import { headers } from "next/headers";
import { configuredSiteUrl, resolveRequestSiteUrl } from "./seo";

export async function getSiteUrl() {
  const configured = configuredSiteUrl();
  if (configured) return configured;
  return resolveRequestSiteUrl(await headers());
}
