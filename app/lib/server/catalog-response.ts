import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { after } from "next/server";
import { createProjectionCache } from "../../../lib/projection-cache";

type Dataset = "catalog" | "codex" | "adult-codex";
const globalCache = globalThis as unknown as {
  catalogProjections?: Map<Dataset, ReturnType<typeof createProjectionCache>>;
};
const caches = globalCache.catalogProjections ??= new Map();
const responses = new WeakMap<Uint8Array, { etag: string; plain?: Uint8Array }>();

export async function catalogResponse(
  request: Request, key: Dataset, readDatabase: () => Promise<Uint8Array>,
) {
  if (new URL(request.url).searchParams.size) {
    return Response.json({ error: "此接口不接受查询参数，请在页面内搜索和筛选。" }, { status: 400 });
  }
  try {
    let cache = caches.get(key);
    if (!cache) {
      cache = createProjectionCache({
        readDatabase,
        readLocal: () => readFile(join(process.cwd(), "public/data", `${key}.json.gz`)),
      });
      caches.set(key, cache);
    }
    const { projection, background } = await cache.read();
    // Keep background refresh alive after sending a fast fallback on serverless hosts.
    if (background) after(() => background);
    const { gzip: compressed, source } = projection;
    let representation = responses.get(compressed);
    if (!representation) {
      representation = { etag: `W/"${createHash("sha256").update(compressed).digest("hex")}"` };
      responses.set(compressed, representation);
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": source === "database"
        ? "public, max-age=60, stale-while-revalidate=300" : "no-store",
      "X-Catalog-Source": source,
      "X-Content-Type-Options": "nosniff",
      Vary: "Accept-Encoding",
      ETag: representation.etag,
    };
    if ((request.headers.get("if-none-match") ?? "").split(",").map((part) => part.trim()).includes(representation.etag)) {
      return new Response(null, { status: 304, headers });
    }
    const gzip = (request.headers.get("accept-encoding") ?? "").split(",").some((part) => {
      const [coding, ...parameters] = part.toLowerCase().trim().split(";");
      const quality = parameters.map((param) => /^q\s*=\s*([0-9.]+)$/.exec(param.trim())).find(Boolean)?.[1] ?? "1";
      return coding.trim() === "gzip" && Number(quality) > 0;
    });
    if (gzip) headers["Content-Encoding"] = "gzip";
    else representation.plain ??= new Uint8Array(gunzipSync(compressed));
    return new Response(new Uint8Array(gzip ? compressed : representation.plain!), { headers });
  } catch (error) {
    console.error("Catalog unavailable:", key, error instanceof Error ? error.name : "UnknownError");
    return Response.json({ error: "数据暂不可用，请稍后重试。" }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
}
