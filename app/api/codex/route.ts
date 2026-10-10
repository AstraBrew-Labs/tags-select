import { gunzipSync } from "node:zlib";
import { readCodexGzip } from "../../lib/server/read-codex";

// No public write methods and no request-time scraping of third-party HTML.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.size) {
    return Response.json({ error: "法典接口不接受查询参数，请在页面内搜索和筛选。" }, { status: 400 });
  }
  try {
    const compressed = await readCodexGzip();
    const gzip = (request.headers.get("accept-encoding") ?? "").split(",").some((part) => {
      const [coding, ...params] = part.trim().toLowerCase().split(";");
      const quality = params.map((param) => /^q\s*=\s*([0-9.]+)$/.exec(param.trim())).find(Boolean)?.[1] ?? "1";
      return coding === "gzip" && Number(quality) > 0;
    });
    return new Response(new Uint8Array(gzip ? compressed : gunzipSync(compressed)), {
      headers: {
        "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff", Vary: "Accept-Encoding",
        ...(gzip ? { "Content-Encoding": "gzip" } : {}),
      },
    });
  } catch (error) {
    console.error("Codex read failed:", error instanceof Error ? error.name : "UnknownError");
    return Response.json(
      { error: "法典暂不可用，请检查数据库连接并执行法典迁移和导入。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
