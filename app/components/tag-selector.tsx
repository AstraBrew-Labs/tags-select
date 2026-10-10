"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Button, Input, Modal, Pagination, Tabs } from "animal-island-ui";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  ArrowRightIcon,
  BookmarkIcon,
  BookIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  FlowerIcon,
  GridIcon,
  HelpCircleIcon,
  HeartIcon,
  EyeIcon,
  ImageIcon,
  PencilIcon,
  TreeIcon,
  UsersIcon,
  LeafIcon,
  PaintbrushIcon,
  PlusIcon,
  SearchIcon,
  ShoppingBagIcon,
  SmileIcon,
  StarIcon,
  SunIcon,
  UserIcon,
} from "naive-icons";
import type { TagCategory } from "../lib/tag-catalog";
import { useFavorites } from "../lib/use-favorites";
import { useTagCatalog } from "../lib/use-tag-catalog";
import TagCard from "./tag-card";
import PromptLookup from "./prompt-lookup";
import DanbooruSearch from "./danbooru-search";
import DirectorCodex, { INITIAL_CODEX_VIEW, type CodexView } from "./director-codex";
import AdultCodex, {
  INITIAL_ADULT_CODEX_VIEW,
  type AdultCodexView,
} from "./adult-codex";
import TagFilterBar, {
  effectiveTagFilter,
  type TagFilter,
} from "./tag-filter-bar";
import PromptComposer from "./prompt-composer";
import ViewportSelect from "./viewport-select";
import {
  adjustPromptWeights,
  clampWeightStep,
  type WeightSyntax,
} from "../lib/prompt-weights";

const categoryIcons: Record<TagCategory, typeof LeafIcon> = {
  environment: TreeIcon,
  quality: StarIcon,
  scene: SunIcon,
  composition: GridIcon,
  artStyle: PaintbrushIcon,
  background: ImageIcon,
  expression: SmileIcon,
  face: EyeIcon,
  body: FlowerIcon,
  clothing: ShoppingBagIcon,
  accessories: BookmarkIcon,
  characterDesign: UserIcon,
  action: PlusIcon,
  illustrator: PencilIcon,
  characters: UsersIcon,
  r18: HeartIcon,
};
const PAGE_SIZE = 60;
const iconProps = {
  color: "currentColor",
  size: 20,
  "aria-hidden": true,
} as const;

export default function TagSelector() {
  const { catalog, loading, error, retry } = useTagCatalog();
  const {
    tags,
    categories,
    groups,
    tagById,
    filterTags,
    formatPrompt,
    normalizeTagIds,
    recipes,
  } = catalog;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const gridRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);
  const [category, setCategory] = useState("all");
  const [group, setGroup] = useState("all");
  const [tagFilter, setTagFilter] = useState<TagFilter>("all");
  const [sort, setSort] = useState("recommended");
  const [feature, setFeature] = useState("generate");
  const [workspaceView, setWorkspaceView] = useState<"discover" | "search">(
    "discover",
  );
  const [lookupInput, setLookupInput] = useState("");
  const [lookupSubmitted, setLookupSubmitted] = useState("");
  const [codexView, setCodexView] = useState<CodexView>(INITIAL_CODEX_VIEW);
  const [adultCodexView, setAdultCodexView] = useState<AdultCodexView>(
    INITIAL_ADULT_CODEX_VIEW,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [weightSyntax, setWeightSyntax] = useState<WeightSyntax>("brackets");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"help" | "recipes" | "clear" | null>(
    null,
  );
  const { favorites, toggleFavorite } = useFavorites(normalizeTagIds);
  const currentTagFilter = effectiveTagFilter(
    tagFilter,
    selected.length,
    favorites.length,
  );
  // Commit the fallback so a removed filter does not reactivate when new items
  // arrive later, including favorites synchronized from another browser tab.
  if (currentTagFilter !== tagFilter) {
    setTagFilter(currentTagFilter);
    setPage(1);
  }
  const shownTags = useMemo(() => {
    const filtered = filterTags({
      query: deferredQuery,
      category,
      group,
      onlyPopular: currentTagFilter === "popular",
      selected: currentTagFilter === "selected" ? selected : undefined,
      favorites: currentTagFilter === "favorites" ? favorites : undefined,
    });
    return sort === "alphabetical"
      ? filtered.sort((a, b) => a.name.localeCompare(b.name))
      : filtered.sort((a, b) => Number(b.popular) - Number(a.popular));
  }, [
    deferredQuery,
    category,
    group,
    currentTagFilter,
    selected,
    favorites,
    sort,
    filterTags,
  ]);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(shownTags.length / PAGE_SIZE)),
  );
  const visibleTags = shownTags.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const selectedIds = selected;
  const prompt = formatPrompt(selectedIds, { weights, syntax: weightSyntax });
  const activeCategory = categories.find((item) => item.id === category);

  function resetPage() {
    setPage(1);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }
  function updateQuery(value: string) {
    setQuery(value);
    resetPage();
  }
  function updateCategory(value: string) {
    setCategory(value);
    setGroup("all");
    resetPage();
  }
  function updateGroup(value: string) {
    setGroup(value);
    resetPage();
  }
  function updateTagFilter(value: TagFilter) {
    setTagFilter(value);
    resetPage();
  }
  function updateSort(value: string) {
    setSort(value);
    resetPage();
  }
  function updatePage(value: number) {
    setPage(value);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }
  function adjustWeight(id: string, delta: number) {
    if (!selected.includes(id)) return;
    setWeights((current) => ({
      ...current,
      [id]: clampWeightStep((current[id] ?? 0) + delta),
    }));
    setNotice("");
  }
  function resetWeight(id: string) {
    setWeights((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setNotice("");
  }
  function toggleTag(id: string) {
    resetWeight(id);
    setSelected((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    setNotice("");
  }
  function showAllTags() {
    setWorkspaceView("discover");
    setFeature("generate");
    resetFilters();
  }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setNotice("提示词已复制，去画出你的灵感吧！");
    } catch {
      setNotice("无法访问剪贴板，请选中下方提示词手动复制。");
    }
  }
  function resetFilters() {
    resetPage();
    setQuery("");
    setCategory("all");
    setGroup("all");
    setTagFilter("all");
  }

  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="site-shell">
        <a className="skip-link" href="#tag-workspace">
          跳到标签选择器
        </a>
        <header className="site-header">
          <Link href="/" className="brand" aria-label="NovelAI Tags 选择器首页">
            <span className="brand-icon">
              <LeafIcon {...iconProps} size={30} />
            </span>
            <span className="brand-name">
              NovelAI <span>Tags 选择器</span>
            </span>
          </Link>
          <nav className="header-nav" aria-label="主导航">
            <Button
              type="text"
              className={workspaceView === "discover" ? "nav-current" : ""}
              aria-pressed={workspaceView === "discover"}
              icon={<GridIcon {...iconProps} size={17} />}
              onClick={showAllTags}
            >
              发现标签
            </Button>
            <Button
              type="text"
              className={workspaceView === "search" ? "nav-current" : ""}
              aria-pressed={workspaceView === "search"}
              icon={<SearchIcon {...iconProps} size={17} />}
              onClick={() => setWorkspaceView("search")}
            >
              搜索标签
            </Button>
            <span className="nav-divider" />
            <Button
              type="text"
              icon={<HelpCircleIcon {...iconProps} size={18} />}
              onClick={() => setDialog("help")}
            >
              使用指南
            </Button>
          </nav>
        </header>

        <main>
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-decoration decoration-left" aria-hidden="true">
              <FlowerIcon color="currentColor" size={103} />
              <span className="little-leaf">
                <LeafIcon color="currentColor" size={44} />
              </span>
            </div>
            <div className="hero-content">
              <div className="eyebrow">
                <span />
                <span>YOUR LITTLE PROMPT GARDEN</span>
                <span />
              </div>
              <h1 id="hero-title">
                让每一份灵感，<span>都有迹可循。</span>
              </h1>
              <p>
                帮助你快速找到需要的 NovelAI Tags{" "}
                <span className="hero-dot">·</span> 让想象，慢慢生长
              </p>
              <div className="hero-caption">
                <LeafIcon {...iconProps} size={15} />
                挑选标签，收集灵感，创作属于你的画面
              </div>
            </div>
            <div
              className="hero-decoration decoration-right"
              aria-hidden="true"
            >
              <div className="sun-decoration">
                <SunIcon color="currentColor" size={42} />
              </div>
              <LeafIcon color="currentColor" size={110} />
              <span className="little-sparkle">
                <StarIcon color="currentColor" size={33} />
              </span>
            </div>
          </section>

          <div id="tag-workspace">
            <div hidden={workspaceView !== "search"}>
              <DanbooruSearch />
            </div>
            <div hidden={workspaceView !== "discover"}>
            <Tabs
              className="feature-tabs"
              aria-label="提示词功能"
              shadow={false}
              activeKey={feature}
              onChange={(key) => {
                setFeature(key);
                setNotice("");
              }}
              items={[
                {
                  key: "generate",
                  label: (
                    <span className="feature-tab-label">
                      <PaintbrushIcon {...iconProps} size={18} />
                      提示词生成
                    </span>
                  ),
                  children: (
                    <>
                      <PromptComposer
                        tags={selectedIds.flatMap((id) => {
                          const tag = tagById.get(id);
                          return tag ? [tag] : [];
                        })}
                        weights={weights}
                        syntax={weightSyntax}
                        prompt={prompt}
                        onAdjust={adjustWeight}
                        onReset={resetWeight}
                        onRemove={toggleTag}
                        onAdjustAll={(delta) => {
                          setWeights((current) =>
                            adjustPromptWeights(selected, current, delta),
                          );
                          setNotice("");
                        }}
                        onResetAll={() => {
                          setWeights({});
                          setNotice("");
                        }}
                        onSwitchSyntax={() => {
                          setWeightSyntax((current) =>
                            current === "brackets" ? "parentheses" : "brackets",
                          );
                          setNotice("");
                        }}
                        onClear={() => setDialog("clear")}
                        onCopy={copyPrompt}
                      />
                      <section
                        className="workspace"
                        aria-label="标签选择工作区"
                      >
                        <aside className="category-sidebar">
                          <div className="section-label">
                            <GridIcon {...iconProps} size={18} />
                            <h2>标签分类</h2>
                          </div>
                          <div className="category-list">
                            <div
                              className={`category-row${category === "all" ? " category-active" : ""}`}
                            >
                              <Button
                                type="text"
                                block
                                className="category-button"
                                aria-pressed={category === "all"}
                                onClick={() => updateCategory("all")}
                              >
                                <span className="category-icon">
                                  <LeafIcon {...iconProps} size={19} />
                                </span>
                                <span>全部标签</span>
                                <span className="category-count">
                                  {tags.length}
                                </span>
                              </Button>
                            </div>
                            {categories.map((item) => {
                              const Icon = categoryIcons[item.id];
                              return (
                                <div
                                  key={item.id}
                                  className={`category-row${category === item.id ? " category-active" : ""}`}
                                >
                                  <Button
                                    type="text"
                                    block
                                    className="category-button"
                                    aria-pressed={category === item.id}
                                    onClick={() => updateCategory(item.id)}
                                  >
                                    <span
                                      className={`category-icon icon-${item.id}`}
                                    >
                                      <Icon {...iconProps} size={19} />
                                    </span>
                                    <span>{item.name}</span>
                                    <span className="category-count">
                                      {item.count}
                                    </span>
                                  </Button>
                                </div>
                              );
                            })}
                          </div>
                          <div className="garden-note">
                            <span className="note-pin" />
                            <FlowerIcon {...iconProps} size={30} />
                            <h3>一点小灵感</h3>
                            <p>
                              不必一次找到所有答案。
                              <br />
                              从一个喜欢的标签开始，
                              <br />
                              让画面慢慢清晰起来。
                            </p>
                            <span className="note-signature">
                              Happy creating!
                            </span>
                          </div>
                        </aside>

                        <div className="tag-browser">
                          <div className="search-wrap">
                            <Input
                              size="large"
                              value={query}
                              onChange={(event) =>
                                updateQuery(event.target.value)
                              }
                              allowClear
                              onClear={() => updateQuery("")}
                              prefix={<SearchIcon {...iconProps} size={21} />}
                              placeholder="搜索标签，试试「长发」或「long hair」"
                              aria-label="搜索中英文标签"
                              suffix={
                                <span className="search-hint">中 / EN</span>
                              }
                            />
                          </div>
                          <div className="quick-search">
                            <span>试试这些</span>
                            {["1girl", "长发", "微笑", "水彩", "森林"].map(
                              (word) => (
                                <Button
                                  key={word}
                                  size="small"
                                  type="text"
                                  onClick={() => updateQuery(word)}
                                >
                                  {word}
                                </Button>
                              ),
                            )}
                          </div>
                          <div className="browser-toolbar">
                            <div className="browser-heading">
                              <h2>
                                {currentTagFilter === "favorites"
                                  ? "我的收藏"
                                  : currentTagFilter === "selected"
                                    ? "已选择"
                                    : (activeCategory?.name ?? "发现你的灵感")}
                              </h2>
                              <span>{shownTags.length} 个标签</span>
                            </div>
                            <Button
                              type="text"
                              size="small"
                              icon={<StarIcon {...iconProps} size={16} />}
                              onClick={() => setDialog("recipes")}
                            >
                              灵感配方
                              <ChevronRightIcon {...iconProps} size={13} />
                            </Button>
                          </div>
                          <div className="filter-row">
                            <TagFilterBar
                              value={currentTagFilter}
                              selectedCount={selected.length}
                              favoritesCount={favorites.length}
                              onChange={updateTagFilter}
                            />
                            <ViewportSelect
                              aria-label="标签排序"
                              options={[
                                { key: "recommended", label: "推荐排序" },
                                { key: "alphabetical", label: "字母排序" },
                              ]}
                              value={sort}
                              onChange={updateSort}
                            />
                          </div>
                          {category !== "all" ? (
                            <div className="group-filter">
                              <span>子分组</span>
                              <ViewportSelect
                                aria-label="原站子分组"
                                value={group}
                                options={[
                                  { key: "all", label: "全部分组" },
                                  ...groups
                                    .filter(
                                      (item) => item.categoryId === category,
                                    )
                                    .map((item) => ({
                                      key: item.id,
                                      label: `${item.nameZh}（${item.count}）`,
                                    })),
                                ]}
                                onChange={updateGroup}
                              />
                            </div>
                          ) : null}
                          {loading ? (
                            <div className="catalog-status" role="status">
                              <LeafIcon {...iconProps} size={34} />
                              <h3>正在从数据库加载标签…</h3>
                              <p>通过只读 API 读取中英文与原站分类。</p>
                            </div>
                          ) : error ? (
                            <div className="catalog-status" role="alert">
                              <HelpCircleIcon {...iconProps} size={34} />
                              <h3>标签暂时无法加载</h3>
                              <p>{error}</p>
                              <Button onClick={retry}>重新加载</Button>
                            </div>
                          ) : null}
                          <div
                            ref={gridRef}
                            className="tag-grid"
                            aria-label="可选标签"
                            aria-busy={loading || query !== deferredQuery}
                          >
                            {visibleTags.map((tag) => (
                              <TagCard
                                key={tag.id}
                                tag={tag}
                                selected={selectedIds.includes(tag.id)}
                                favorite={favorites.includes(tag.id)}
                                onSelect={() => toggleTag(tag.id)}
                                onFavorite={() => toggleFavorite(tag.id)}
                              />
                            ))}
                          </div>
                          {!loading && !error && shownTags.length === 0 ? (
                            <div className="empty-search">
                              <SearchIcon {...iconProps} size={40} />
                              <h3>还没有找到这个标签</h3>
                              <p>试试更短的关键词，或者换一个分类看看。</p>
                              <Button
                                onClick={() => {
                                  resetFilters();
                                }}
                              >
                                浏览全部标签
                              </Button>
                            </div>
                          ) : null}
                          {shownTags.length > PAGE_SIZE ? (
                            <div className="tag-pagination">
                              <Pagination
                                total={shownTags.length}
                                pageSize={PAGE_SIZE}
                                current={currentPage}
                                onChange={updatePage}
                                variant="teal"
                              />
                            </div>
                          ) : null}
                          <div className="browser-footnote">
                            <LeafIcon {...iconProps} size={14} />
                            <span>点击卡片选择 · 点击星标收藏</span>
                            <span>
                              {shownTags.length > 0
                                ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, shownTags.length)}`
                                : "0"}{" "}
                              / {shownTags.length}
                            </span>
                          </div>
                        </div>
                      </section>

                      <section className="bottom-banner">
                        <div className="banner-flower">
                          <FlowerIcon {...iconProps} size={29} />
                        </div>
                        <div>
                          <h2>好画面，始于一个小小的灵感。</h2>
                          <p>不确定从哪里开始？给自己一份轻巧的灵感配方。</p>
                        </div>
                        <Button
                          icon={<StarIcon {...iconProps} size={18} />}
                          onClick={() => setDialog("recipes")}
                        >
                          试试灵感配方
                          <ArrowRightIcon {...iconProps} size={17} />
                        </Button>
                      </section>
                    </>
                  ),
                },
                {
                  key: "lookup",
                  label: (
                    <span className="feature-tab-label">
                      <SearchIcon {...iconProps} size={18} />
                      提示词查找
                    </span>
                  ),
                  children: (
                    <PromptLookup
                      catalog={catalog}
                      loading={loading}
                      error={error}
                      retry={retry}
                      input={lookupInput}
                      submitted={lookupSubmitted}
                      onInputChange={setLookupInput}
                      onSubmit={setLookupSubmitted}
                      selected={selected}
                      favorites={favorites}
                      onFavorite={toggleFavorite}
                      onShowGenerator={() => setFeature("generate")}
                      onAdd={(ids) => {
                        const valid = ids.filter((id) => tagById.has(id));
                        setSelected((current) => [
                          ...new Set([...current, ...valid]),
                        ]);
                        setNotice("匹配词条已加入提示词生成器。");
                      }}
                    />
                  ),
                },
                {
                  key: "director-codex",
                  label: (
                    <span className="feature-tab-label">
                      <BookIcon {...iconProps} size={18} />
                      所长的个人法典
                    </span>
                  ),
                  children: (
                    <DirectorCodex
                      view={codexView}
                      onViewChange={setCodexView}
                      onLookup={(prompt) => {
                        setLookupInput(prompt);
                        setLookupSubmitted(prompt);
                        setFeature("lookup");
                      }}
                    />
                  ),
                },
                {
                  key: "adult-codex",
                  label: (
                    <span className="feature-tab-label">
                      <BookIcon {...iconProps} size={18} />
                      所长的成人法典
                      <span className="adult-tab-badge">18+</span>
                    </span>
                  ),
                  children: (
                    <AdultCodex
                      view={adultCodexView}
                      onViewChange={setAdultCodexView}
                      onLookup={(prompt) => {
                        setLookupInput(prompt);
                        setLookupSubmitted(prompt);
                        setFeature("lookup");
                      }}
                    />
                  ),
                },
              ]}
            />
            </div>
          </div>
        </main>
        <footer className="site-footer">
          <span>
            <LeafIcon {...iconProps} size={15} />
            NovelAI Tags 选择器
          </span>
          <p>用一点点标签，描绘大大的想象。</p>
          <span>非官方社区工具 · 只读 API 标签库</span>
        </footer>
        <AnimatePresence>
          {notice ? (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, transform: "translateY(8px)" }}
              animate={{ opacity: 1, transform: "translateY(0)" }}
              exit={{ opacity: 0 }}
            >
              <CheckIcon {...iconProps} />
              <span>{notice}</span>
              <Button
                type="text"
                size="small"
                aria-label="关闭提示"
                icon={<CloseIcon {...iconProps} size={16} />}
                onClick={() => setNotice("")}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <Modal
          variant="game"
          typewriter={false}
          open={dialog !== null}
          onClose={() => setDialog(null)}
          title={
            dialog === "help"
              ? "从一个标签开始"
              : dialog === "clear"
                ? "清空这个灵感篮子？"
                : "给灵感一点起点"
          }
          footer={
            dialog === "clear" ? (
              <>
                <Button onClick={() => setDialog(null)}>再想想</Button>
                <Button
                  type="primary"
                  danger
                  onClick={() => {
                    setSelected([]);
                    setWeights({});
                    setNotice("");
                    setDialog(null);
                  }}
                >
                  确认清空
                </Button>
              </>
            ) : (
              <Button onClick={() => setDialog(null)}>知道啦</Button>
            )
          }
        >
          {dialog === "help" ? (
            <div className="help-content">
              <p>
                这里是一个非官方 NovelAI
                绘画提示词辅助工具，不会调用模型，也不会生成图片。
              </p>
              <ol>
                <li>
                  <strong>找到喜欢的词</strong>
                  ：用中文或英文搜索，或从分类开始探索。
                </li>
                <li>
                  <strong>组合你的画面</strong>
                  ：在“提示词生成”中点击卡片加入提示词，再次点击取消。顶部编辑台可以逐项或批量减权、加权，点击“加权符号切换”在大括号与圆括号之间切换。使用“提示词查找”粘贴一组
                  tags，查看每个词的中文和分类。
                </li>
                <li>
                  <strong>留住常用标签</strong>
                  ：点击小星星收藏，收藏保存在当前浏览器。
                </li>
                <li>
                  <strong>带走你的灵感</strong>：复制后粘贴到 NovelAI
                  的对应提示词输入框。
                </li>
              </ol>
              <p className="help-caveat">
                当前提供 {tags.length} 条数据库标签，数据来自
                loadTags.js，分类与子分组遵循原站。 中英文通过只读 API
                加载；颜色占位符需要自行替换，组合提示词按原文复制。这不是官方词库，效果因模型版本而异。
              </p>
            </div>
          ) : dialog === "clear" ? (
            <p>
              将移除灵感篮子中的 {selectedIds.length}{" "}
              个标签，查找输入与收藏不受影响。
            </p>
          ) : (
            <div className="recipe-list">
              <p>
                选择一个配方，添加到提示词。已有标签会保留，重复标签会自动去掉。
              </p>
              {recipes.map((recipe) => (
                <Button
                  key={recipe.name}
                  block
                  onClick={() => {
                    setSelected((current) => [
                      ...new Set([...current, ...recipe.ids]),
                    ]);
                    setFeature("generate");
                    setDialog(null);
                    setNotice(
                      `已加入「${recipe.name}」配方，可以继续挑选标签。`,
                    );
                  }}
                >
                  <span>
                    <strong>{recipe.name}</strong>
                    <small>{recipe.description}</small>
                  </span>
                  <PlusIcon {...iconProps} />
                </Button>
              ))}
            </div>
          )}
        </Modal>
      </div>
    </MotionConfig>
  );
}
