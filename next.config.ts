import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/catalog": ["./public/data/catalog.json.gz"],
    "/api/codex": ["./public/data/codex.json.gz"],
    "/api/adult-codex": ["./public/data/adult-codex.json.gz"],
    "/api/ai/tags": ["./public/data/catalog.json.gz"],
    "/api/ai/mcp": ["./public/data/catalog.json.gz"],
  },
  experimental: {
    agentFeedback: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
