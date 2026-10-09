import { gunzipSync } from "node:zlib";
import { readCatalogGzip } from "../../lib/server/read-catalog";

// Only GET is implemented. Next supplies HEAD/OPTIONS; mutations receive 405.
export async function GET(request: Request) {
  if (new URL(request.url).searchParams.size > 0) {
    return Response.json(
      { error: "此接口不接受查询参数，请使用返回的分类与分组在页面筛选。" },
      { status: 400 },
    );
  }
  try {
    const compressed = await readCatalogGzip();
    const useGzip = (request.headers.get("accept-encoding") ?? "")
      .split(",")
      .some((part) => {
        const [coding, ...parameters] = part.toLowerCase().trim().split(";");
        const quality =
          parameters
            .map((parameter) => /^q\s*=\s*([0-9.]+)$/.exec(parameter.trim()))
            .find(Boolean)?.[1] ?? "1";
        return coding.trim() === "gzip" && Number(quality) > 0;
      });
    const body = useGzip
      ? new Uint8Array(compressed)
      : new Uint8Array(gunzipSync(compressed));
    return new Response(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Vary: "Accept-Encoding",
        "X-Content-Type-Options": "nosniff",
        ...(useGzip ? { "Content-Encoding": "gzip" } : {}),
      },
    });
  } catch (error) {
    console.error("Tag catalog read failed:", {
      name: error instanceof Error ? error.name : "UnknownError",
      code:
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined,
    });
    return Response.json(
      {
        error:
          "标签数据库暂不可用，请检查 DATABASE_URL 并完成数据库迁移和数据导入。",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
