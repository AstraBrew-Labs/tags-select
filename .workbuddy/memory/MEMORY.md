# 项目长期约定（tags-select / NovelAI Tags 选择器）

## 目录与产物

- `data/` = **已提交的源码快照**（`loadTags.js`、`director-codex.json`、`adult-codex.json`、`ai-formats/*.md`）。
- `public/data/` = **生成产物**，被 `.gitignore` 忽略，由 `bun run data:build`（`scripts/build-local-catalogs.ts`）从 `data/` 生成。
  - 结论：需要随仓库提交的静态资源一律放 `data/`，不要放 `public/data/`。
- 服务端路由运行时读取的文件，必须在 `next.config.ts` 的 `outputFileTracingIncludes` 里按路由显式声明（如 `"/api/ai/formats": ["./data/ai-formats/*.md"]`），否则 serverless 部署会缺文件。

## AI 搜索接入面

- 单一维护源：`app/lib/ai-documents.ts` 生成 `llm.txt` / `llm.md` / `skills/novelai-tags-search/SKILL.md`(通过 `bun run ai:build`) / `/api/ai/mcp-config` / `/api/ai/openapi.json`。改完必须跑 `bun run ai:build` 同步仓库里的便携 `SKILL.md`（测试会断言两者一致）。
- 端口：
  - `GET /api/ai/tags` — 本地词典 + Danbooru 语义合并搜索，内联例图与推荐。
  - `GET /api/ai/formats` — 提示词格式规范，无 `format` 返回索引 JSON，有 `format` 返回 `text/plain`。
  - `POST /api/ai/mcp` — Streamable HTTP、无状态 JSON、只读工具。
- 所有 AI 路径**绝不读取/发送 `DANBOORU_SEARCH_API_KEY`，不回退私有额度**；上游失败时合并模式降级为仅本地结果。
- 新增 AI 能力时的同步清单：`lib/ai-*.ts` 服务模块 + `app/api/ai/*/route.ts` + `lib/ai-mcp.ts` 工具 + `app/lib/ai-documents.ts`（guide/skill/openapi，并升 `info.version`）+ `ai-search.tsx` 端点行 + README + 测试。

## 交互与 UI

- 组件按 `tag-selector.tsx` 的 `workspaceView` 页签条件渲染（`ai` 页签才挂载 `AiSearch`），所以首页 SSR HTML 不含该区块 —— 这不代表渲染失败。
- 用户对 UI 间距/对齐极敏感：改动布局后要按已有页面精确对齐，优先紧凑。

## 验证流程（每轮必做）

`bun run typecheck` → `bun run lint` → `bun test`；改到路由/文档时再用本机 dev server（`:3000`）curl 实测 `/api/ai/tags`、`/api/ai/formats`、`/api/ai/mcp`、`/api/ai/openapi.json`、`/llm.md`。
注意：长期运行的 `next dev` 会缓存已编辑模块（曾出现新导出为 undefined → 路由误报 502）；改完源码可 `touch` 相关文件或重启 dev server。
改动 `public/data/` 或 `data/` 后，页面需重新 `bun run data:build` 并重启服务。
