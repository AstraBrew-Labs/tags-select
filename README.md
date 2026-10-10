# NovelAI Tags 选择器

帮助你快速找到需要的 NovelAI Tags。Next.js 单页界面，通过**只读 API** 从 PostgreSQL 加载标签，不再把静态 i18n 词库打包进前端。

## 技术栈

- Next.js 16.4 App Router + React 19 + TypeScript
- animal-island-ui、naive-icons、Motion (`motion/react`)
- Prisma ORM 7.10 + `@prisma/adapter-pg` + PostgreSQL
- Bun：依赖管理、数据导入与单元测试

## 数据来源与分类

原始数据是 `data/loadTags.js`，由用户提供的文件复制得到；分类标题与顺序已经核对原网站：`https://tag-select.nai4.top/`。

按 **原站一级分类 → loadTags.js 中文子分组 → 双语标签** 存储。

| 原始键           | 原站分类  |
| ---------------- | --------- |
| Quality          | 质量&控制 |
| characters       | 游戏&角色 |
| Scene            | 画面&光影 |
| Environment      | 环境&生物 |
| Composition      | 构图&天气 |
| Art_Style        | 画风&材质 |
| Background       | 背景&家具 |
| Expression       | 表情&情绪 |
| Face             | 脸部&妆容 |
| Body             | 身体&发型 |
| Clothing         | 服装&风格 |
| Accessories      | 配饰&物品 |
| Character_Design | 人设&物种 |
| Action           | 动作&姿态 |
| Illustrator      | 画师&画风 |
| r18              | R18       |

当前源文件包含 **16 个分类、322 个子分组、6,997 条原始标签**。与之前的 6,964 条 i18n 数据不同，本次保留原文件中的空中文名称、重复英文值和空分组，不合并不同来源条目。

- `zh` / `en`：页面中文名及英文提示词。
- 中文 `A|B` 拆为主名称与 `aliases`；英文尾部 `// 备注` 独立保存为 `note`。
- `rawZh` / `rawEn` 仍保留原始字符串，包括空白名称，方便核对和追溯。
- 英文的大小写、下划线、组合提示词和颜色占位符保留不变。没有中文名称或中文仅为空白的条目只显示英文标题，不显示占位文字或重复的英文副标题。
- 源文件仅通过 Acorn 提取静态对象字面量，**不会 import、eval 或执行其中的 JavaScript**。

## 配置与启动

在 `.env` 或运行环境中设置 PostgreSQL 连接字符串：

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=verify-full"
```

新项目可参考 `.env.example`；已有 `.env` 请勿覆盖。连接字符串不得设置为 `NEXT_PUBLIC_*`。

```sh
bun install
bun run db:setup  # 应用迁移，然后将 loadTags.js 导入数据库
bun dev
```

打开 `http://localhost:3000`。

Prisma CLI、客户端和 PostgreSQL adapter 固定在相同的 7.10.0 稳定版本。生成客户端位于 `generated/prisma/`，由安装或构建自动生成，不需要提交。

### 数据库命令

```sh
bun run db:generate      # 生成 Prisma Client
bun run db:migrate       # prisma migrate deploy，不重置数据库
bun run db:import:check  # 检查数据与画师图片匹配，不连接或写入数据库
bun run db:seed          # 导入或更新相同来源记录
bun run db:setup         # 迁移 + 导入
bun run db:studio        # 本地数据库管理工具，不是网站公开 API
```

所有模型和迁移历史使用独立的 **`novelai_tags` schema**，不会重置 `public` 或其他项目的表。

导入使用确定性 ID、参数化 SQL 批量 upsert 和事务，重复执行不会产生重复记录，失败时回滚。导入会更新现有记录，但不会自动删除已从源文件移除的旧记录。

可以覆盖默认数据文件：

```sh
TAGS_SOURCE=/absolute/path/to/loadTags.js bun run db:seed
```

## 画师图片

原站命名规则为：

```text
中文原始名_去掉 artist: 前缀的英文值.webp
```

包含逗号的组合画风使用 `中文原始名_画风.webp`。

导入脚本读取 `public/images/artist/*.webp`，只为确实存在的本地文件写入 `imageUrl`。当前 **135 条画师记录全部匹配成功**；新增数据缺图时会报告数量，页面改用 Danbooru 查询例图，无结果时显示占位，不伪造链接。图片以 URL 编码后的本地路径返回，由 animal-island-ui Image 组件渲染，启用懒加载并保持图片比例。

## 只读 API

```http
GET /api/catalog
```

返回：

- `categories`：原站分类的中英文名称、原始键和实时标签数量
- `groups`：原始中文子分组、所属分类和标签数量
- `tags`：中英文、别名、备注、画师图片 URL、分类与分组 ID
- `source`：文件名、原站地址、导入时间和导入统计

Prisma 管理模型、迁移和导入；目录 API 使用 `pg` 连接池做只读大快照读取。导入事务在更新分类 / 分组 / 标签表的同时生成压缩的目录读模型，保存到 `CatalogImport.catalogGzip`。API 读取压缩投影，浏览器自动解压后仍得到完整中英文目录。

读模型与规范化数据在同一个事务里更新。数据源是 `loadTags.js`：更新源文件后运行 `bun run db:seed` 刷新读模型；直接在 Studio 修改标签表不会自动刷新 API 投影。

### 本地优先与后台缓存

普通标签、个人法典、成人法典共用以下加载策略：

- `bun run dev` / `bun run build` 自动执行 `bun run data:build`，从 `data/loadTags.js`、`data/director-codex.json`、`data/adult-codex.json` 生成经过校验的 `public/data/*.json` 和 gzip 快照。不连接数据库、不执行原始 JavaScript 数据文件，不把大 JSON 塞进首页 JavaScript。
- 首次访问没有缓存时直接加载这些本地资源，数据库不参与首屏等待。已有浏览器缓存时优先恢复缓存；API 成功后更新所有订阅视图和页面内存，并写入 IndexedDB `novelai-tags:datasets` 的 `catalogs` 存储区。普通标签快照的 `source` 为 `null`，不伪造数据库导入时间。
- 网站挂载后会预取全部三套目录，不需要打开每个法典页签。浏览器 API 缓存有效期为 **7 天**，从获取成功时计算，不因读取续期。未同步成功或缓存过期的目录在页面可见时每分钟尝试刷新；恢复联网或切回页面也会检查。
- 过期但结构有效的 API 缓存仍可在断网时显示。缓存损坏、存储被禁用、容量不足或 API 失败时，本地原数据兜底；刷新和重试不清空已有内容，不影响搜索、筛选、分页或复制。
- 并发读取和 Strict Mode effect 重放合并为一次请求。只有通过完整结构校验的数据库 API 数据会成为一周有效的持久缓存；服务端返回的本地兜底不会被误标为新数据库数据。收藏、搜索历史等原有存储互不影响。

此接口不接受查询参数。所有目录搜索和分页仍在内存中完成。数据库更新后，有效浏览器缓存可能最多保留一周旧目录；需要立即同步时，可在开发者工具中删除 IndexedDB `catalogs` 下对应的 `catalog` / `codex` / `adult-codex` 记录再刷新，不必清除收藏或整个网站存储。

### 服务端读取优化

三个目录接口通过 `pg` 读取压缩投影，只执行一次参数化 SELECT，不再开启交互式事务，也不再让大快照通过 Prisma 的序列化层。大 BYTEA 通过 PostgreSQL Base64 编码传输、Node Buffer 解码，比 BYTEA 文本的十六进制传输更紧凑。只读连接池最多 3 条连接，复用连接而非每次使用后销毁；API 后台查询超时为 90 秒，Prisma 导入脚本不受该读取超时影响。

每个服务进程缓存成功的数据库投影 **5 分钟**，并合并并发查询。过期投影先返回再后台刷新，数据库失败保留上次好数据，并至少退避 30 秒。冷启动最多等待数据库约 **1.2 秒**，之后返回本地完整快照，通过 Next `after()` 继续后台读取数据库。后台完成后后续请求使用数据库投影；无共享存储时不同服务实例各有自己的缓存。部署平台必须允许接口的后台执行时长（路由声明 `maxDuration = 120`，实际受平台上限约束）。

响应包含 `X-Catalog-Source: database | local`，明确数据来源。数据库响应支持 `ETag` / 304、gzip 和 `Cache-Control: public, max-age=60, stale-while-revalidate=300`；本地兜底与错误响应使用 `no-store`。正常调用者无需下载重复内容。数据库与本地资源都不可用时才返回 503。

只有 GET 实现；Next.js 自动处理 HEAD / OPTIONS，其他写入方法返回 405。接口没有任何写数据库的操作；凭据、连接字符串和数据库错误细节不返回给客户端。部署产物必须包括自动生成的 `public/data`；Next 输出追踪已显式纳入对应 gzip 兜底文件。

## 界面功能

### 所长的个人法典

在「发现标签」的「提示词查找」右侧新增第三个页签「所长的个人法典」。

- 来源：`https://nai-bot.pages.dev/法典/所长常规novalai个人法典/`，整理者为**一般所长**。
- 本次采集快照为 **2026-10-10**；原页面标注版本为 **2026.5.1**，不将采集日期当成作者更新日期。
- 按原页面 H2 分类、H3 标题和段落标签组保留顺序；无标签组的目录标题不生成空卡片。当前收录 **63 个分类、4,435 个标题、4,531 个标签组**。
- 仅收录通用、非露骨内容，另保守排除带明确未成年人描述的条目；超出范围的条目整条排除，不把删除敏感词后的组合冒充作者原配方。本次排除 657 个源条目；不下载原站图片，不嵌入原站 HTML、脚本或 iframe。
- 保留花括号、方括号、数值权重、画师前缀和占位符；版本标签、组序号和说明与实际标签分开。原文中的拼写和语法不擅自修正。
- 左侧可滚动目录，右侧搜索标题、英文标签、分类和备注；每页 12 个标题，桌面双列、手机单列。长组可滚动或展开，多组条目可展开剩余组。
- 每组可单独复制，标题可复制全部组；复制内容不包含卡片标题/按钮文案。「查找组内标签」将原始组传给现有提示词查找器，由查找器去权重解析。
- 每条提供原文锚点，页面显示作者、原文版本与采集日期。切换页签时保留法典查询条件与页码。

数据快照位于 `data/director-codex.json`，通过独立的 Prisma `CodexCategory` / `CodexEntry` / `CodexImport` 表保存到现有 PostgreSQL `novelai_tags` schema。标题、分组 JSON 和备注规范化存储，压缩读模型与数据在同一事务内更新。导入只管理法典表，**不修改原有标签库**；重新导入更新既有项并移除过时的法典项，失败整体回滚。

```sh
bun run db:migrate
bun run db:codex:check   # 本地数据校验，不写数据库
bun run db:codex:import  # 导入已审核的快照，支持重复执行
```

如需更新来源，先保存原页面 HTML，再提取/审核并导入：

```sh
CODEX_HTML=/absolute/path/to/source.html bun run db:codex:check
bun run db:codex:import
```

`CODEX_HTML` 会通过非执行式 HTML 提取器更新快照；原站正文结构变化会报错停止，不执行页面 JavaScript。可用 `CODEX_SOURCE` 指定其他快照 JSON。数据库同步需要应用迁移和导入快照；数据库未就绪时使用 `data` 中的完整原数据兜底，而非示例。

只读 `GET /api/codex` 从数据库读取，不接受查询参数；其余写方法返回 405。数据库读取事务为只读，支持 gzip，不在用户访问时实时抓取原站。浏览器首次成功请求后保存**一周缓存**，键为 `novelai-tags:director-codex:v1`；一周后重新加载，读取不会续期。损坏缓存自动重新请求，失败响应不缓存，localStorage 容量不足时使用内存。此缓存与标签库、收藏、搜索历史、Danbooru 的一天缓存彼此独立。

### 所长的成人法典

「发现标签」中「所长的个人法典」右侧是第四个页签「所长的成人法典」。它从整理者一般所长公布的上卷 / 下卷页面提取标题、章节和原始标签组，保存为本站只读快照：

- 来源：`https://nai-bot.pages.dev/法典/所长色色novalai个人法典上/` 与 `.../下/`。
- 当前快照包含两卷、110 个章节、9,440 个标题和 13,055 个标签组；页面仅显示文本，不导入原页图片。
- 支持按上卷 / 下卷章节筛选、标题或标签搜索、分页、复制单个标签组 / 全部标签组、跳转到“提示词查找”。
- 成人内容只在明确的 18+ 页签中展示；用户访问时从数据库读快照，不实时抓取外站。
- 快照源文件位于 `data/adult-codex.json`，数据库使用独立的 `AdultCodexVolume` / `AdultCodexCategory` / `AdultCodexEntry` / `AdultCodexImport` 表，不会修改普通标签库或所长的个人法典表。
- 首次部署或更新快照时执行：

```sh
bun run db:migrate
bun run db:adult-codex:check
bun run db:adult-codex:import
```

- 如需更新来源，解析器为 `scripts/parse-adult-codex-source.ts`。保存两页 HTML 后运行：

```sh
ADULT_CODEX_UPPER_HTML=/absolute/path/upper.html \
ADULT_CODEX_LOWER_HTML=/absolute/path/lower.html \
bun run scripts/parse-adult-codex-source.ts
```

  然后再次执行 `bun run db:adult-codex:check` 和 `bun run db:adult-codex:import`。页面面板为 `app/components/adult-codex.tsx`，校验与搜索索引为 `app/lib/adult-codex.ts`，数据库只读接口为 `app/api/adult-codex/route.ts`。

### 现有标签功能

- 中英文与别名搜索、原站一级分类及中文子分组筛选
- 选择菜单保留 animal-island-ui Select 的原始样式和键盘交互；浮层按窗口空间向上 / 下展开，长列表可滚动，避免被 Tabs 裁切
- 常用推荐（编辑精选，不代表使用统计）、字母排序、分页
- 有选中项时显示“已选择”筛选（紧邻常用推荐），可与分类、搜索叠加；移除最后一项后隐藏并恢复全部筛选
- 顶部宽幅提示词编辑台：已选词条横向换行，`− / 词条 / + / 移除` 紧邻排列；每次调整一档，范围 -20 到 +20；点击词条恢复默认；支持全部减权、全部加权和重置全部权重
- “加权符号切换”按 `{tag}` → `(tag)` → NovelAI `数值::tag::` 三种格式循环，切换保留档位，预览和复制同步更新。前两种减权使用 `[tag]`；NovelAI 数值按 `1.05 ** 档位` 计算、保留最多三位小数，加权一档为 `1.05::tag::`，减权一档为 `0.952::tag::`，默认权重不添加符号。查找支持全部三种格式。
- 生成预览和复制时，将每个英文 tag 名称内部的空白转换为下划线，例如 `misaka mikoto` → `misaka_mikoto`、`long hair` → `long_hair`；逗号分隔、画师前缀、名称括号和加权语法保留。标签卡片、词条显示和数据库原文不变，空格与下划线变体输出时按首次选择去重。
- 两个独立功能：**提示词生成**（选卡、预览、一键复制）与 **提示词查找**（粘贴 tags，逐项解释并显示分类）
- 查找支持逗号 / 中文逗号 / 换行、常见权重括号、英文大小写和下划线归一化，也可匹配中文名与别名
- 已匹配与未匹配项分别展示，重复输入会合并计数；组合词条明确标注，多个来源匹配不会静默选取
- 查找结果可逐条或全部加入生成器，两个功能切换时保留已选词和查找输入
- 基于 animal-island-ui Card / Image / Button 组合的标签卡片；点击与键盘事件直接绑定 Card，整张卡片点击或 Enter / 空格切换选择，默认状态保留库的底色，选中使用库的 `app-teal` 配色，禁用通过外层灰度处理并关闭交互；移除卡片底部的添加 / 勾选图标与操作提示，收藏为右上角独立透明 link 图标按钮（与选择卡片并列，不嵌套）
- 画师本地参考图、灵感配方和中文使用指南
- “我的收藏”入口统一移到筛选栏最右侧，仅有收藏时显示数量；点击只展示收藏词条，取消最后一项自动隐藏并回到全部标签
- 收藏保存在当前浏览器；旧英文名与能匹配的旧 i18n 键兼容迁移
- 移动端适配、加载 / 空 / 错误状态，遵循减少动态效果设置

提示词生成不再区分正向与负向，只有一个篮子。提示词篮子、权重、符号格式、查找输入及结果仅保留在当前页面会话。移除词条会清除该词权重，重新选择恢复默认；清空篮子会同时清空全部权重。组合词条按完整原始值整体加权，不重写内部内容。查找在浏览器缓存的标签库中完成，不会上传粘贴的提示词，也不调用模型。英文复制值来自 API，不会输出数据库 ID；完全相同的英文值在复制时去重，但数据库记录不合并。

## Danbooru 搜索标签

顶部“搜索标签”使用 Danbooru Tag Searcher API：

- 搜索请求只经过本站服务端代理，浏览器不会接触 API Key。
- 固定先请求国内节点；网络错误、超时、非 2xx 或返回结构异常时再回退国际节点。两节点都失败时返回可重试的 503 / 504。
- 国际节点的凭据配置在服务端环境变量 `DANBOORU_SEARCH_API_KEY`，不要设置为 `NEXT_PUBLIC_*`，也不要提交 `.env`。请求同时携带 `X-DanbooruSearch-Client: tag-select-astrabrew` 和 `X-DanbooruSearch-Site: https://tag-select.astrabrew.cn/`。
- 前端只缓存成功的查询结果，按“关键词 + 数量 + 成人标签开关”区分，最多保留 30 条，缓存有效期为 **1 天**；失败结果不会缓存。
- 输入提示词会先移除 `{}` / `[]` / `()` 的外围权重语法、`(tag:1.2)` 与正负 `0.7::tag::` 数值权重，拆分加权组并按原始顺序合并重复 tag；减权标签仍保留。保留 `artist:` 前缀、数字标签和 artist/character 名称内部括号，首个 tag 的下划线与拼写不改写、不猜测纠错。浏览器的查找、搜索、缓存键及历史使用去权重后的标签，服务端也清理单次请求。
- 搜索框支持多行及最多 10,000 字符的粘贴（Enter 搜索，Shift + Enter 换行）。长提示词按完整 tag 分为最多 12 批，每批不超过 300 字符、最多 2 批并发，每批保留国内优先／国际回退及一天缓存；合并结果按英文 tag 去重、相关度排序并限制结果数量。任何批失败则提示重试，不把缺失批的部分结果当完整成功；过长单个描述或超过批数会明确提示，不截断标签。
- 成人标签首次访问默认关闭。手动开启时使用 UI 库原生 Modal 二次确认年满 **18 岁**，确认前不开启，也不发起成人搜索或推荐请求；取消、Esc 均保持关闭。确认后的开启状态与关闭状态独立保存在当前浏览器（`novelai-tags:danbooru-preferences:v1`），无缓存过期时间；后续访问恢复有效且已确认的记录，手动关闭后再次开启仍需确认。损坏、旧版本或缺少年龄确认的记录按关闭处理；保存失败时提示用户并只在当前页面保留选择。
- 成人历史记录不视为年龄确认：当前关闭时重搜成人历史会先弹窗，确认后才执行原搜索；取消不搜索。历史恢复安全模式时也会保存关闭偏好。该记录仅保存开关与确认状态，不收集生日，不写入本站数据库。
- 页面明确标注“数据源：Danbooru 数据库；服务提供：Danbooru Tag Searcher API”，支持复制单个或全部英文标签。
- 搜索结果卡片可直接选择一个或多个标签；选择后通过 `/artists` 和 `/related` 获取推荐擅长画师、同类标签与关联推荐，三类推荐均按国内节点优先、国际节点回退处理。
- 推荐依据独立于当前搜索结果保存在页面状态中，可跨搜索累积：先选第一个搜索词的结果，再搜索第二个词并继续选择，三个推荐板块会使用所有已选标签的组合与分类。新搜索、历史重搜、搜索失败或无结果均不会清空已有选择；回到先前搜索时卡片仍显示选中状态。
- “同类标签”中的卡片也可直接选择（支持鼠标、Enter 与空格），加入同一组推荐依据，与搜索结果共同查询三个推荐板块；再次选择同名标签可取消。更新后即使该标签不再出现在列表中，已选名称和分类仍保留，可从上方移除。展开说明、复制和资料链接仍是独立操作，不触发选择。推荐接口没有逐条成人标记，因此成人模式下选入的同类标签保守标记为安全性未知，关闭成人模式时移除；安全模式下选入的同类标签继续保留。
- 四宫格上方显示全部已选推荐依据（中英文与数量），支持单独移除、清空；最多选择 **8 个**，达到上限会提示用户先移除，不会自动挤掉之前的选择。关闭成人标签开关（含从历史恢复安全模式）会移除成人推荐依据、保留安全标签并更新推荐。跨搜索选择不等于长期存储，刷新页面后重置。
- 桌面搜索工作区为四宫格：左上搜索结果、右上推荐擅长画师、左下同类标签、右下关联推荐。四个板块保持固定高度、标题常驻、列表独立滚动；手机端改为单列。未选择、加载、错误及空结果均在对应板块内显示，不再向下展开长列表。
- 搜索、同类与关联标签使用单列紧凑卡片，主标题显示第一个中文名称（无中文则只显示英文）；完整中文别名、说明、匹配依据及画师擅长标签可通过“展开说明”查看，不截断内容。展开、复制及资料链接位于独立操作行，不覆盖标题，也不会触发卡片选择。
- 完整搜索描述与全部识别关键词收纳在四宫格上方的原生 Collapse 中，默认折叠，避免长描述挤占搜索结果的可视空间。
- 搜索历史仅保存在当前浏览器（`novelai-tags:danbooru-history:v1`），按最近使用排序，最多保留 **30 条**。提交搜索时即记录，因此缓存命中、无结果和服务失败的搜索也可以再次执行；相同关键词与条件会去重并移到最前面。
- 搜索框下方默认显示最近 3 条历史，可展开查看全部、单条删除或清空。点击记录会恢复关键词、成人标签开关和结果数量并立即搜索，仍使用原有一天结果缓存；历史本身不随结果缓存到期而删除。
- 历史读取做版本与字段校验，通过稳定的服务端空快照避免 hydration 不一致；其他标签页的历史变更会同步。浏览器禁止存储或空间不足时退回页面内存并提示用户，不影响搜索。删除历史不会删除结果缓存或收藏。
- 画师标签（包括搜索结果和推荐中的画师）跳转至 `https://danbooru.donmai.us/posts?tags={tag}` 查看作品；其他标签仍跳转至 `https://danbooru.donmai.us/wiki_pages/{tag}`。标签名经过 URL 编码。
- 推荐结果也只缓存成功响应，按已选标签、分类和成人标签设置区分，缓存有效期为 **1 天**；同类标签与关联推荐会去重。

## 标签例图

“发现标签”的所有分类卡片通过现有兼容接口 `/api/danbooru/character-image?tag=...` 查询官方 `posts.json`，
规范化空格、大小写，并保留作品名称内部的括号和问号。查询附加 `rating:g`、`limit=1`，
只展示普通分级图片，优先使用预览图。因此浏览器直接搜索未加分级限制时有结果，
不一定意味着本站安全查询也有图。
对于已核实的源标签差异，仅图片查询映射名称（例如
`jouga_maya_(gochuumon_wa_usagi_desu_ka?)` → `jouga_maya`），不修改原标签或复制内容，
不自动删除其他角色的作品后缀，以免查到同名角色。

图片查询使用现有提示词解析器去除外围加权语法，去除已识别的 `artist:` 前缀；
组合词条仅以第一项查询，不改变原标签、选择或复制内容，不允许其他搜索操作符覆盖分级。
画师已有的本地参考图优先保留，并标注“本地画风参考”；其余标注“Danbooru 例图 · 仅供参考”。
标签浏览区和使用指南常驻声明：Tags 的例图由 Danbooru 提供，
可能与 tag 本身的意思并没有关系，仅供参考。
UI 库补丁同时修复缓存图片在加载事件早于 effect 时保持透明的问题，确保重载后图片可见。

图片 URL 和成功的无图结果缓存一周，失败不缓存；浏览器持久缓存、服务端内存缓存、
相同标签的并发去重和最多三个客户端并发请求一起减少查询。保留原图片缓存键，已有角色缓存仍可使用。图片仅在卡片接近可视区域
时加载，不影响选词、复制和收藏。请求失败与确实无图分别显示。

如果浏览器能访问 Danbooru、Next.js 请求却固定在 10 秒超时，检查后端网络：
浏览器可能使用系统代理，但 Node.js 请求不会自动沿用 macOS 的系统代理。
本地可在 `.env` 中显式配置已有的 HTTP(S) 代理：

```dotenv
DANBOORU_IMAGE_PROXY_URL="http://127.0.0.1:7892"
```

仅标签例图查询使用该代理，不修改全局 dispatcher，不影响数据库或其他 API。
也支持 `HTTPS_PROXY` / `HTTP_PROXY`（及小写变量）；专用变量优先。
部署环境没有本地代理时不要照搬 `127.0.0.1`，能直连则不设置此变量。
超时返回 504，其他上游请求失败返回 502，两者都不会写入一周的无图缓存。

## SEO 与分享素材

- 统一元数据在 `app/lib/seo.ts`：页面标题、摘要、canonical、Open Graph、Twitter 大图卡片及 `WebSite` / `WebApplication` JSON-LD。结构化数据不虚构评分，不给当前无独立 URL 的搜索界面添加 SearchAction。
- SEO 不写死域名或本地端口：未设置 `SITE_URL` 时，canonical、分享图绝对 URL、JSON-LD 和 sitemap 跟随当前请求的 Host 与协议。本地 `bun run dev` 始终使用实际访问地址，即使配置了生产 `SITE_URL`，也可用 localhost、其他端口或局域网地址检查 OG 图。
- 正式部署可设置 `SITE_URL="https://你的正式域名"`，在构建和运行环境保持一致，以固定 canonical 并启用静态 SEO 输出；不设置时按请求生成 SEO 信息，首页静态首屏仍保留。反向代理需保留原始 Host 并传递 `x-forwarded-proto: http` 或 `https`，不信任 `x-forwarded-host`；代理不能保留 Host 时请配置 `SITE_URL`。不要把预览域名设置为正式 canonical。
- `/robots.txt` 允许网页和图片资源抓取，排除 `/api/`；`/sitemap.xml` 只列真实首页，不把客户端 tabs 或搜索条件当成独立页面，也不虚构更新时间。
- OG 图为 `public/og/novelai-tags.png`，1200×630 静态 PNG，OG 与 Twitter 共用。源图 `assets/seo/og.svg` 由站点叶片标识、中英文标签元素和中文标题合成，不包含远程例图，不依赖实时接口。
- 图标包含自适应 SVG、ICO 内嵌 16/32/48/64px、48px PNG、180px Apple Touch Icon、192/512px 应用图标和安全区内的独立 maskable 图标。Next.js 文件约定自动输出 favicon、SVG、PNG、Apple 图标链接，不与手动 icons 元数据混用；manifest 不声称具备离线功能。
- 素材已作为静态项目文件保存，无需上线时生成；更新源图或标识后运行 `bun run seo:build`。合成使用 Sharp，重新生成 OG 图的机器需要有 Noto Sans SC、PingFang SC 或可用的中文字体，运行后检查中文显示。
- 上线后可向搜索平台提交 sitemap 并检查 canonical / favicon / OG 图片是否公开可访问；这些配置不保证收录或排名，也不代替独立可索引内容页。

## 开发检查

```sh
bun run typecheck
bun run lint
bun test
bun run build
bun start
```

测试覆盖安全解析、原站分类顺序、完整源数据、别名与备注、135 张画师图片匹配、客户端 API 适配、收藏迁移、提示词格式、粘贴查找（权重括号、重复项、未知词和组合词条），以及所长的成人法典双卷快照校验、章节筛选、搜索、分页和复制布局。

## 主要文件

```text
prisma/schema.prisma             # PostgreSQL 模型
prisma/migrations/               # 可部署的数据库迁移
prisma.config.ts                 # DATABASE_URL、迁移与 seed 配置
data/loadTags.js                 # 可复现的原始数据快照（不是应用代码）
scripts/source-categories.ts     # 原站分类与顺序
scripts/parse-tag-source.ts      # 安全解析、规范化与本地图片匹配
scripts/seed-tags.ts             # 事务式幂等导入
app/api/catalog/route.ts         # 只读 GET 接口
app/lib/server/                  # server-only 数据库读取
app/lib/catalog-types.ts         # API 中英文类型约定
app/lib/use-tag-catalog.ts       # 前端缓存优先加载、API 请求和重试
app/lib/catalog-cache.ts         # 一周 localStorage 缓存、校验、并发请求合并
app/lib/tag-catalog.ts           # API 数据索引与筛选，无静态词库
app/components/tag-selector.tsx # 发现标签的四个页签与单一提示词篮子
app/components/prompt-lookup.tsx # 粘贴输入、解释结果与加入生成器
app/components/danbooru-search.tsx # Danbooru 双节点搜索与双语结果
app/lib/danbooru-recommendations.ts # Danbooru 画师 / 同类 / 关联推荐缓存
app/lib/prompt-lookup.ts         # 分词、括号 / 数值权重处理与精确匹配索引
app/lib/prompt-weights.ts        # 权重档位、边界与输出格式
app/lib/danbooru-types.ts        # Danbooru 搜索请求 / 响应类型与安全解析
app/lib/danbooru-cache.ts        # Danbooru 搜索结果一天缓存
lib/danbooru-search-service.ts   # 服务端固定节点代理与回退
lib/danbooru-recommendation-service.ts # /artists 与 /related 服务端代理
app/components/tag-filter-bar.tsx # 全部 / 常用推荐 / 动态已选择 / 动态收藏筛选
app/components/viewport-select.tsx # Select 浮层布局与键盘滚动适配
app/lib/select-menu-layout.ts    # 可测试的窗口边界计算
app/components/selected-prompt-tag.tsx # 单行紧凑词条及紧邻加减按钮
app/components/prompt-composer.tsx # 顶部宽幅编辑、批量操作和预览复制
app/components/tag-card.tsx     # 整卡选择、选中配色、禁用态与独立收藏
data/adult-codex.json             # 成人法典双卷只读快照
scripts/parse-adult-codex-source.ts # 从保存的两页 HTML 提取成人法典
app/api/adult-codex/route.ts      # 成人法典只读接口
app/lib/adult-codex.ts            # 成人法典校验、索引和原文链接
app/lib/use-adult-codex.ts       # 成人法典加载与页面内存缓存
app/components/adult-codex.tsx   # 成人法典 18+ 目录、搜索、复制面板
```

这是非官方社区辅助工具，包含原文件的成人内容分类；没有接入 NovelAI 账户、模型 API 或图片生成服务。源词条、颜色占位符及高级指令仍需按实际模型与使用环境自行调整。

`TagCard` 提供可选 `disabled` 属性。当前 API 没有禁用标记，页面不会擅自禁用真实标签；接入业务限制时由调用方传入。Card 库本身没有 selected / disabled 专用属性，选中使用 color API，禁用灰度施加在外层 article，而非覆盖 Card 的颜色、圆角或阴影。
