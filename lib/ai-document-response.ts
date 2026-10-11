import { AI_DOCUMENTS, buildAiDocument, type AiDocumentKey } from "../app/lib/ai-documents";
import { resolveRequestSiteUrl } from "../app/lib/seo";
import { AI_CORS_HEADERS } from "./ai-http";

export function aiRequestOrigin(request: Request) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  if (!headers.has("host")) headers.set("host", url.host);
  if (!headers.has("x-forwarded-proto")) headers.set("x-forwarded-proto", url.protocol.slice(0, -1));
  // AI instructions follow the serving host, not the SEO canonical deployment.
  return resolveRequestSiteUrl(headers, { NODE_ENV: "development" }).origin;
}

export function aiDocumentResponse(request: Request, key: AiDocumentKey) {
  const document = AI_DOCUMENTS.find((item) => item.key === key)!;
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== "download") ||
      params.getAll("download").length > 1 ||
      (params.has("download") && params.get("download") !== "1")) {
    return Response.json({ error: "只支持 download=1。" }, { status: 400, headers: AI_CORS_HEADERS });
  }
  return new Response(buildAiDocument(key, aiRequestOrigin(request)), { headers: {
    ...AI_CORS_HEADERS,
    "Content-Type": `${document.type}; charset=utf-8`,
    "Cache-Control": "public, max-age=300",
    Vary: "Host, X-Forwarded-Proto",
    ...(params.get("download") === "1" ? { "Content-Disposition": `attachment; filename="${document.name}"` } : {}),
  } });
}
