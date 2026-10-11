import type { Viewport } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";
import "animal-island-ui/style";
import "./globals.css";
import DatasetPrefetch from "./components/dataset-prefetch";
import { siteMetadata, siteStructuredData } from "./lib/seo";
import { getSiteUrl } from "./lib/seo-request";

export async function generateMetadata() {
  return siteMetadata(await getSiteUrl());
}
export const viewport: Viewport = {
  themeColor: "#f7f8ef",
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

async function StructuredData() {
  const siteUrl = await getSiteUrl();
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(siteStructuredData(siteUrl)).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN">
      {/* Extensions may inject attributes such as cz-shortcut-listen before hydration.
          Suppress only body-level differences; child components remain checked. */}
      <body suppressHydrationWarning>
        <Suspense fallback={null}><StructuredData /></Suspense>
        <DatasetPrefetch />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
