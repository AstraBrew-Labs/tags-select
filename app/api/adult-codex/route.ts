import { gunzipSync } from "node:zlib";
import { readAdultCodexGzip } from "../../lib/server/read-adult-codex";

export async function GET(request: Request) {
  if (new URL(request.url).searchParams.size) {
    return Response.json({ error: "法典接口不接受查询参数，请在页面内搜索和筛选。" }, { status: 400 });
  }
  try {
    const compressed = await readAdultCodexGzip();
    const gzip = (request.headers.get("accept-encoding") ?? "").split(",").some((part) => {
      const [coding, ...params] = part.trim().toLowerCase().split(";");
      const quality = params.map((param) => /^q\s*=\s*([0-9.]+)$/.exec(param.trim())).find(Boolean)?.[1] ?? "1";
      return coding === "gzip" && Number(quality) > 0;
    });
    return new Response(new Uint8Array(gzip ? compressed : gunzipSync(compressed)), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        Vary: "Accept-Encoding",
        ...(gzip ? { "Content-Encoding": "gzip" } : {}),
      },
    });
  } catch (error) {
    console.error("Adult codex read failed:", error instanceof Error ? error.name : "UnknownError");
    return Response.json(
      { error: "成人法典暂不可用，请先执行成人法典数据库迁移和导入。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
