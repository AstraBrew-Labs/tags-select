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

导入脚本读取 `public/images/artist/*.webp`，只为确实存在的本地文件写入 `imageUrl`。当前 **135 条画师记录全部匹配成功**；新增数据缺图时会报告数量，页面显示无图占位，不伪造链接。图片以 URL 编码后的本地路径返回，由 animal-island-ui Image 组件渲染，启用懒加载并保持图片比例。

## 只读 API

```http
GET /api/catalog
```

返回：

- `categories`：原站分类的中英文名称、原始键和实时标签数量
- `groups`：原始中文子分组、所属分类和标签数量
- `tags`：中英文、别名、备注、画师图片 URL、分类与分组 ID
- `source`：文件名、原站地址、导入时间和导入统计

Prisma 管理模型、迁移、导入和 API 读取。导入事务在更新分类 / 分组 / 标签表的同时生成压缩的目录读模型，保存到 `CatalogImport.catalogGzip`。API 从数据库读取这个小记录，避免远程库的大结果集传输开销，浏览器自动解压后仍得到完整中英文目录。

读模型与规范化数据在同一个事务里更新。数据源是 `loadTags.js`：更新源文件后运行 `bun run db:seed` 刷新读模型；直接在 Studio 修改标签表不会自动刷新 API 投影。API 不会回退到代码里内置的词库。

此接口不接受查询参数。界面首次加载时请求完整目录，获取成功后保存到浏览器 localStorage，缓存有效期为 **7 天**（从获取成功时开始计算，不会因读取续期）。之后刷新页面或重新打开网站，优先读取有效缓存，不请求 API；缓存过期、损坏或版本不兼容时重新获取。搜索、筛选和分页（每页 60 条）在内存中完成。

缓存键为 `novelai-tags:catalog:v1`。相同页面的并发读取会合并为一次 API 请求；存储被禁用或容量不足时回退到内存缓存，不影响页面使用。网络错误和不合法的响应不会保存为缓存。错误界面的“重新加载”会清除目录缓存并重新获取，不会清除收藏。

数据库数据更新后，已缓存的浏览器可能最多保留一周旧目录。需要立即更新时，可在浏览器开发者工具中删除该缓存键后刷新页面。

只有 GET 实现；Next.js 自动处理 HEAD / OPTIONS，POST / PUT / PATCH / DELETE 返回 405。数据库读取事务执行 `SET TRANSACTION READ ONLY`，不允许在 API 事务中写入数据。凭据、原始连接字符串和数据库错误细节不返回给客户端。

API 的 HTTP 响应仍使用 `Cache-Control: no-store`（不依赖 HTTP 缓存，一周缓存由前端数据层管理），支持 gzip 内容协商，并设置 `Vary: Accept-Encoding`。数据库不可用或尚未导入时返回 503，界面显示错误及重试按钮，**不会偷偷回退到示例数据**。

## 界面功能

- 中英文与别名搜索、原站一级分类及中文子分组筛选
- 常用推荐（编辑精选，不代表使用统计）、字母排序、分页
- 有选中项时显示“已选择”筛选（紧邻常用推荐），可与分类、搜索和收藏叠加；移除最后一项后隐藏并恢复全部筛选
- 顶部宽幅提示词编辑台：已选词条横向换行，`− / 词条 / + / 移除` 紧邻排列；每次调整一档，范围 -20 到 +20；点击词条恢复默认；支持全部减权、全部加权和重置全部权重
- “加权符号切换”只在 `{tag}` 与 `(tag)` 之间切换，减权始终使用 `[tag]`；不再生成数值权重格式。切换保留档位，预览和复制同步更新。查找仍可识别粘贴来的数值权重语法
- 两个独立功能：**提示词生成**（选卡、预览、一键复制）与 **提示词查找**（粘贴 tags，逐项解释并显示分类）
- 查找支持逗号 / 中文逗号 / 换行、常见权重括号、英文大小写和下划线归一化，也可匹配中文名与别名
- 已匹配与未匹配项分别展示，重复输入会合并计数；组合词条明确标注，多个来源匹配不会静默选取
- 查找结果可逐条或全部加入生成器，两个功能切换时保留已选词和查找输入
- 基于 animal-island-ui Card / Image / Button 组合的标签卡片；点击与键盘事件直接绑定 Card，整张卡片点击或 Enter / 空格切换选择，默认状态保留库的底色，选中使用库的 `app-teal` 配色，禁用通过外层灰度处理并关闭交互；移除卡片底部的添加 / 勾选图标与操作提示，收藏为右上角独立透明 link 图标按钮（与选择卡片并列，不嵌套）
- 画师本地参考图、灵感配方和中文使用指南
- 收藏保存在当前浏览器；旧英文名与能匹配的旧 i18n 键兼容迁移
- 移动端适配、加载 / 空 / 错误状态，遵循减少动态效果设置

提示词生成不再区分正向与负向，只有一个篮子。提示词篮子、权重、符号格式、查找输入及结果仅保留在当前页面会话。移除词条会清除该词权重，重新选择恢复默认；清空篮子会同时清空全部权重。组合词条按完整原始值整体加权，不重写内部内容。查找在浏览器缓存的标签库中完成，不会上传粘贴的提示词，也不调用模型。英文复制值来自 API，不会输出数据库 ID；完全相同的英文值在复制时去重，但数据库记录不合并。

## 开发检查

```sh
bun run typecheck
bun run lint
bun test
bun run build
bun start
```

测试覆盖安全解析、原站分类顺序、完整源数据、别名与备注、135 张画师图片匹配、客户端 API 适配、收藏迁移、提示词格式及粘贴查找（权重括号、重复项、未知词和组合词条）。

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
app/components/tag-selector.tsx # 两个功能面板与单一提示词篮子
app/components/prompt-lookup.tsx # 粘贴输入、解释结果与加入生成器
app/lib/prompt-lookup.ts         # 分词、括号 / 数值权重处理与精确匹配索引
app/lib/prompt-weights.ts        # 权重档位、边界与输出格式
app/components/tag-filter-bar.tsx # 全部 / 常用推荐 / 动态已选择筛选
app/components/selected-prompt-tag.tsx # 单行紧凑词条及紧邻加减按钮
app/components/prompt-composer.tsx # 顶部宽幅编辑、批量操作和预览复制
app/components/tag-card.tsx     # 整卡选择、选中配色、禁用态与独立收藏
```

这是非官方社区辅助工具，包含原文件的成人内容分类；没有接入 NovelAI 账户、模型 API 或图片生成服务。源词条、颜色占位符及高级指令仍需按实际模型与使用环境自行调整。

`TagCard` 提供可选 `disabled` 属性。当前 API 没有禁用标记，页面不会擅自禁用真实标签；接入业务限制时由调用方传入。Card 库本身没有 selected / disabled 专用属性，选中使用 color API，禁用灰度施加在外层 article，而非覆盖 Card 的颜色、圆角或阴影。
