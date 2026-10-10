"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, Card, Collapse, Input, Switch, Tag, Title } from "animal-island-ui";
import {
  CopyIcon,
  ExternalLinkIcon,
  HelpCircleIcon,
  SearchIcon,
  TagIcon,
} from "naive-icons";
import {
  DANBOORU_DEFAULT_LIMIT,
  DANBOORU_QUERY_MAX_LENGTH,
  DANBOORU_RECOMMENDATION_TAG_LIMIT,
  DANBOORU_SERVICE_ERROR,
  applyDanbooruNsfwFilter,
  isDanbooruNsfw,
  type DanbooruTag,
  type DanbooruSearchInput,
  type DanbooruSearchResponse,
} from "../lib/danbooru-types";
import { danbooruLoader, type SearchResult } from "../lib/danbooru-cache";
import {
  danbooruRecommendationLoader,
  type RecommendationResult,
} from "../lib/danbooru-recommendations";
import { danbooruHistory } from "../lib/danbooru-history";
import DanbooruSearchHistory from "./danbooru-search-history";

const icon = { color: "currentColor", size: 18, "aria-hidden": true } as const;
const categoryNames: Record<string, string> = {
  General: "通用",
  Artist: "画师",
  Copyright: "作品",
  Character: "角色",
  Meta: "元信息",
};
const counts = new Intl.NumberFormat("zh-CN");

export function getDanbooruWikiUrl(tag: string) {
  return `https://danbooru.donmai.us/wiki_pages/${encodeURIComponent(tag)}`;
}

export function getDanbooruArtistUrl(tag: string) {
  return `https://danbooru.donmai.us/posts?tags=${encodeURIComponent(tag)}`;
}

function getDanbooruTagUrl(tag: string, category: string) {
  return category === "Artist"
    ? getDanbooruArtistUrl(tag)
    : getDanbooruWikiUrl(tag);
}

export function getDanbooruDisplayName(tag: { cn_name: string; tag: string }) {
  // Only the list title is shortened. The raw aliases stay intact in details.
  return (
    tag.cn_name.split(/[,，]/).map((name) => name.trim()).find(Boolean) || tag.tag
  );
}

type DetailTag = Pick<DanbooruTag, "tag" | "cn_name" | "category" | "wiki"> &
  Partial<
    Pick<DanbooruTag, "nsfw" | "count" | "source" | "layer" | "alias_from" | "artist_top_tags">
  > & {
    sources?: string[];
  };

export function DanbooruTagDetails({ tag }: { tag: DetailTag }) {
  return (
    <div className="danbooru-tag-details-content">
      {tag.cn_name.trim() ? (
        <div>
          <h4>完整中文名称与别名</h4>
          <p>{tag.cn_name}</p>
        </div>
      ) : null}
      <div>
        <h4>英文标签</h4>
        <p>{tag.tag}</p>
      </div>
      <div>
        <h4>标签说明</h4>
        <p className="danbooru-definition">
          {tag.wiki.trim() || "数据源暂未提供说明，可通过 Danbooru 资料链接查看。"}
        </p>
      </div>
      {tag.alias_from ? (
        <div><h4>匹配别名</h4><p>{tag.alias_from}</p></div>
      ) : null}
      {tag.source || tag.layer ? (
        <div><h4>匹配依据</h4><p>{[tag.source, tag.layer].filter(Boolean).join(" · ")}</p></div>
      ) : null}
      {tag.sources?.length ? <div><h4>关联依据</h4><p>{tag.sources.join("、")}</p></div> : null}
      {tag.artist_top_tags?.length ? (
        <div><h4>画师擅长标签</h4><p>{tag.artist_top_tags.join("、")}</p></div>
      ) : null}
    </div>
  );
}

export function DanbooruSearchContext({
  query,
  keywords,
}: {
  query: string;
  keywords: readonly string[];
}) {
  return (
    <Collapse
      className="danbooru-search-context"
      question={`搜索描述与识别关键词（${keywords.length}）`}
      answer={
        <div className="danbooru-search-context-content">
          <div>
            <h3>完整搜索描述</h3>
            <p>{query}</p>
          </div>
          {keywords.length > 0 ? (
            <div>
              <h3>全部识别关键词</h3>
              <ul>
                {keywords.map((keyword, index) => (
                  <li key={`${keyword}:${index}`}>{keyword}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      }
    />
  );
}

function DashboardPanel({
  id,
  title,
  count,
  description,
  children,
  action,
  busy = false,
}: {
  id: string;
  title: string;
  count?: number;
  description: string;
  children: ReactNode;
  action?: ReactNode;
  busy?: boolean;
}) {
  return (
    <Card
      className="danbooru-panel"
      role="region"
      aria-labelledby={`${id}-title`}
      aria-busy={busy}
      data-panel={id}
    >
      <header className="danbooru-panel-header">
        <div className="danbooru-panel-heading">
          <h3 id={`${id}-title`}>
            <Title size="small" variant="tab">{title}</Title>
          </h3>
          {count !== undefined ? (
            <Tag size="small" variant="soft" color="app-teal">{count}</Tag>
          ) : null}
          {action ? <div className="danbooru-panel-action">{action}</div> : null}
        </div>
        <p>{description}</p>
      </header>
      <div
        className="danbooru-panel-body"
        role="region"
        aria-label={`${title}列表`}
        tabIndex={0}
      >
        {children}
      </div>
    </Card>
  );
}

function PanelState({
  title,
  children,
  error = false,
  loading = false,
  action,
}: {
  title: string;
  children: ReactNode;
  error?: boolean;
  loading?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className="danbooru-panel-state"
      role={error ? "alert" : loading ? "status" : undefined}
    >
      {error ? <HelpCircleIcon {...icon} size={28} /> : <TagIcon {...icon} size={28} />}
      <h4>{title}</h4>
      <p>{children}</p>
      {action}
    </div>
  );
}

function DanbooruTagCard({
  tag,
  onCopy,
  selected = false,
  onToggleTag,
  recommendation = false,
}: {
  tag: DetailTag;
  onCopy: (text: string) => void;
  selected?: boolean;
  onToggleTag?: (tag: string) => void;
  recommendation?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const name = getDanbooruDisplayName(tag);
  return (
    <article className="danbooru-result-card-wrap">
      <Card
        className="danbooru-result-card"
        color={selected ? "app-teal" : "default"}
        hoverable={Boolean(onToggleTag)}
        role={onToggleTag ? "button" : undefined}
        tabIndex={onToggleTag ? 0 : undefined}
        aria-pressed={onToggleTag ? selected : undefined}
        title={onToggleTag ? selected ? "已选择此标签 · 再次点击取消" : "点击卡片选择此标签" : undefined}
        onClick={onToggleTag ? () => onToggleTag(tag.tag) : undefined}
        onKeyDown={onToggleTag ? (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggleTag(tag.tag);
          }
        } : undefined}
      >
        <div className="danbooru-card-heading">
          <div className="danbooru-card-name">
            <h3>{name}</h3>
            {name !== tag.tag ? <p className="danbooru-english">{tag.tag}</p> : null}
          </div>
          <div className="danbooru-card-meta">
            <Tag size="small" variant="soft" color="app-teal">{categoryNames[tag.category] ?? tag.category}</Tag>
            {tag.nsfw !== undefined && isDanbooruNsfw(tag.nsfw) ? <Tag size="small" variant="soft" color="app-orange">成人标签</Tag> : null}
            {tag.count !== undefined ? <span>使用量 {counts.format(tag.count)}</span> : null}
          </div>
        </div>
      </Card>
      <div className="danbooru-card-actions">
        <Button type="link" size="small" icon={<HelpCircleIcon {...icon} />}
          aria-label={`${expanded ? "收起" : "展开"} ${tag.tag} 的完整说明`}
          aria-expanded={expanded} aria-controls={expanded ? detailsId : undefined}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? "收起说明" : "展开说明"}
        </Button>
        <div className="danbooru-card-links">
          <Button type="link" size="small" icon={<CopyIcon {...icon} />}
            aria-label={`复制 ${recommendation ? "推荐标签 " : ""}${tag.tag}`} title="复制英文标签"
            onClick={() => onCopy(tag.tag)}>复制</Button>
          <a className="danbooru-wiki-link" href={getDanbooruTagUrl(tag.tag, tag.category)}
            target="_blank" rel="noopener noreferrer"
            aria-label={`查看 ${tag.tag} 的 Danbooru ${tag.category === "Artist" ? "作品" : "详细资料"}`}
            title={tag.category === "Artist" ? "查看画师作品" : "查看 Danbooru 详细资料"}>
            <ExternalLinkIcon {...icon} />
            <span>{tag.category === "Artist" ? "查看作品" : "详细资料"}</span>
          </a>
        </div>
      </div>
      {expanded ? (
        <Card type="dashed" className="danbooru-tag-details" id={detailsId}>
          <DanbooruTagDetails tag={tag} />
        </Card>
      ) : null}
    </article>
  );
}

export function DanbooruResults({
  data,
  onCopy,
  selectedTags = [],
  onToggleTag,
}: {
  data: DanbooruSearchResponse;
  onCopy: (text: string) => void;
  selectedTags?: readonly string[];
  onToggleTag?: (tag: string) => void;
}) {
  return (
    <div className="danbooru-results" aria-label="Danbooru 搜索结果">
      {data.results.map((tag, index) => (
        <DanbooruTagCard key={`${tag.tag}:${index}`} tag={tag} onCopy={onCopy}
          selected={selectedTags.includes(tag.tag)} onToggleTag={onToggleTag} />
      ))}
    </div>
  );
}

function RecommendationTagCard({ tag, onCopy }: { tag: DetailTag; onCopy: (text: string) => void }) {
  return <DanbooruTagCard tag={tag} onCopy={onCopy} recommendation />;
}

export function DanbooruRecommendations({
  result,
  selectedTags,
  onCopy,
  loading = false,
  error = "",
  onRetry,
}: {
  result: RecommendationResult | null;
  selectedTags: readonly string[];
  onCopy: (text: string) => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const data = result?.data;
  const ready = selectedTags.length > 0 && !loading && !error && data;
  function description(node?: "domestic" | "international") {
    if (selectedTags.length === 0) return "选择左上角的搜索结果后，自动显示推荐";
    if (loading) return `根据已选 ${selectedTags.length} 个标签更新中…`;
    if (error) return "服务暂时不可用，可保留选择并重试";
    return `已选 ${selectedTags.length} 个标签 · ${result?.cached ? "一天内缓存" : "刚刚更新"} · ${node === "international" ? "国际节点" : "国内节点"}`;
  }
  const pendingState = selectedTags.length === 0 ? (
    <PanelState title="先选择一个标签">点击左上角的结果卡片，从感兴趣的标签继续发现。</PanelState>
  ) : loading ? (
    <PanelState title="正在查找推荐…" loading>正在查询相关画师和标签，节点切换会自动完成。</PanelState>
  ) : error ? (
    <PanelState
      title="推荐服务暂时不可用"
      error
      action={onRetry ? <Button size="small" onClick={onRetry}>重试推荐</Button> : undefined}
    >{error}</PanelState>
  ) : (
    <PanelState title="等待推荐结果">根据当前选择查找相关数据。</PanelState>
  );
  return (
    <>
      <DashboardPanel
        id="artists"
        title="推荐擅长画师"
        count={ready ? data.artists.length : undefined}
        description={description(data?.nodes.artists)}
        busy={loading}
      >
        {ready ? data.artists.length > 0 ? (
          <div className="danbooru-artist-grid">
            {data.artists.map((artist) => (
              <Card className="danbooru-artist-card" key={artist.artist}>
                <div className="danbooru-recommendation-heading">
                  <h4>
                    <a href={getDanbooruArtistUrl(artist.artist)} target="_blank" rel="noopener noreferrer" title="查看画师作品">
                      {artist.artist}
                      <ExternalLinkIcon {...icon} size={15} />
                    </a>
                  </h4>
                  <Button type="link" size="small" icon={<CopyIcon {...icon} />}
                    aria-label={`复制画师标签 ${artist.artist}`} onClick={() => onCopy(artist.artist)} />
                </div>
                <p>共现 {counts.format(artist.cooc_count)} 次 · {counts.format(artist.post_count)} 个作品</p>
                <div className="danbooru-artist-tags">
                  {artist.top_tags.slice(0, 5).map((tag) => (
                    <Tag key={tag} size="small" variant="outlined">{tag}</Tag>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ) : <PanelState title="暂无匹配画师">试试选择其他标签，或调整标签组合。</PanelState> : pendingState}
      </DashboardPanel>
      <DashboardPanel
        id="same-category"
        title="同类标签"
        count={ready ? data.sameCategory.length : undefined}
        description={description(data?.nodes.sameCategory)}
        busy={loading}
      >
        {ready ? data.sameCategory.length > 0 ? (
          <div className="danbooru-recommendation-grid">
            {data.sameCategory.map((tag) => <RecommendationTagCard key={tag.tag} tag={tag} onCopy={onCopy} />)}
          </div>
        ) : <PanelState title="暂无同类标签">试试选择其他标签，或调整标签组合。</PanelState> : pendingState}
      </DashboardPanel>
      <DashboardPanel
        id="related"
        title="关联推荐"
        count={ready ? data.related.length : undefined}
        description={description(data?.nodes.related)}
        busy={loading}
      >
        {ready ? data.related.length > 0 ? (
          <div className="danbooru-recommendation-grid">
            {data.related.map((tag) => <RecommendationTagCard key={tag.tag} tag={tag} onCopy={onCopy} />)}
          </div>
        ) : <PanelState title="暂无关联推荐">试试选择其他标签，或调整标签组合。</PanelState> : pendingState}
      </DashboardPanel>
    </>
  );
}

export default function DanbooruSearch() {
  const historyEntries = useSyncExternalStore(
    danbooruHistory.subscribe,
    danbooruHistory.getSnapshot,
    danbooruHistory.getServerSnapshot,
  );
  const [query, setQuery] = useState("");
  const [showNsfw, setShowNsfw] = useState(false);
  const [submitted, setSubmitted] = useState<DanbooruSearchInput | null>(null);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [recommendationResult, setRecommendationResult] =
    useState<RecommendationResult | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationError, setRecommendationError] = useState("");
  const requestId = useRef(0);
  const recommendationRequestId = useRef(0);
  useEffect(
    () => () => {
      requestId.current += 1;
      recommendationRequestId.current += 1;
    },
    [],
  );

  async function search(input: DanbooruSearchInput) {
    const id = ++requestId.current;
    recommendationRequestId.current += 1;
    setSubmitted(input);
    setLoading(true);
    setError("");
    setNotice("");
    if (!danbooruHistory.record(input)) {
      setNotice("浏览器不允许保存历史记录，本次记录仅保留在当前页面，刷新后可能丢失。");
    }
    setResult(null);
    setSelectedTags([]);
    setRecommendationResult(null);
    setRecommendationError("");
    setRecommendationLoading(false);
    try {
      const next = await danbooruLoader.load(input);
      if (requestId.current === id) setResult(next);
    } catch {
      if (requestId.current === id) setError(DANBOORU_SERVICE_ERROR);
    } finally {
      if (requestId.current === id) setLoading(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("英文标签已复制。");
    } catch {
      setNotice("无法访问剪贴板，请选中标签文字手动复制。");
    }
  }

  // Also apply the current switch to already-rendered results. This prevents
  // adult rows from remaining visible for the short period before the user
  // submits a new search after turning the switch off.
  const data = result
    ? {
        ...applyDanbooruNsfwFilter(result.data, showNsfw),
        node: result.data.node,
      }
    : undefined;
  const selectedResultTags =
    data?.results.filter((tag) => selectedTags.includes(tag.tag)) ?? [];
  const recommendationTags = selectedResultTags.map((tag) => tag.tag);
  const recommendationCategories = [
    ...new Set(selectedResultTags.map((tag) => tag.category)),
  ];
  function requestRecommendations(
    tags: string[],
    categories: string[],
    includeNsfw: boolean,
  ) {
    const id = ++recommendationRequestId.current;
    setRecommendationResult(null);
    if (tags.length === 0) {
      setRecommendationError("");
      setRecommendationLoading(false);
      return;
    }
    setRecommendationLoading(true);
    setRecommendationError("");
    void danbooruRecommendationLoader
      .load({
        tags,
        categories,
        show_nsfw: includeNsfw,
      })
      .then((next) => {
        if (recommendationRequestId.current === id)
          setRecommendationResult(next);
      })
      .catch(() => {
        if (recommendationRequestId.current === id)
          setRecommendationError("推荐服务暂时不可用，请稍后重试。");
      })
      .finally(() => {
        if (recommendationRequestId.current === id)
          setRecommendationLoading(false);
      });
  }
  function toggleRecommendationTag(tag: string) {
    const nextTags = selectedTags.includes(tag)
      ? selectedTags.filter((item) => item !== tag)
      : [...selectedTags, tag].slice(-DANBOORU_RECOMMENDATION_TAG_LIMIT);
    const nextItems =
      data?.results.filter((item) => nextTags.includes(item.tag)) ?? [];
    setSelectedTags(nextTags);
    requestRecommendations(
      nextTags,
      [...new Set(nextItems.map((item) => item.category))],
      showNsfw,
    );
  }
  function changeNsfwSetting(nextValue: boolean) {
    setShowNsfw(nextValue);
    if (selectedTags.length === 0) return;
    const nextData = result
      ? {
          ...applyDanbooruNsfwFilter(result.data, nextValue),
          node: result.data.node,
        }
      : undefined;
    const nextItems =
      nextData?.results.filter((item) => selectedTags.includes(item.tag)) ?? [];
    setSelectedTags(nextItems.map((item) => item.tag));
    requestRecommendations(
      nextItems.map((item) => item.tag),
      [...new Set(nextItems.map((item) => item.category))],
      nextValue,
    );
  }
  const draftChanged =
    submitted &&
    (submitted.query !== query.trim() || submitted.show_nsfw !== showNsfw);

  return (
    <section className="danbooru-search" aria-labelledby="danbooru-title">
      <Card className="danbooru-search-card">
        <div className="danbooru-search-intro">
          <div>
            <div className="section-label">
              <SearchIcon {...icon} size={21} />
              <h2 id="danbooru-title">搜索标签</h2>
            </div>
            <p>用中文或英文描述你想画的内容，寻找 Danbooru 中的真实标签。</p>
          </div>
          <Tag variant="soft" color="app-teal">
            Danbooru
          </Tag>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!loading && query.trim())
              void search({
                query: query.trim(),
                limit: DANBOORU_DEFAULT_LIMIT,
                show_nsfw: showNsfw,
              });
          }}
        >
          <div className="danbooru-search-form">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              size="large"
              prefix={<SearchIcon {...icon} size={21} />}
              placeholder="例如：白色水手服、星空下的森林、long hair"
              aria-label="Danbooru 搜索关键词"
              aria-describedby="danbooru-search-help"
              maxLength={DANBOORU_QUERY_MAX_LENGTH}
              allowClear
              onClear={() => setQuery("")}
              onKeyDown={(event) => {
                if (event.key === "Enter" && event.nativeEvent.isComposing)
                  event.preventDefault();
              }}
            />
            <Button
              type="primary"
              size="large"
              htmlType="submit"
              icon={<SearchIcon {...icon} />}
              loading={loading}
              disabled={loading || !query.trim()}
            >
              {loading ? "正在搜索" : "搜索标签"}
            </Button>
          </div>
          <div className="danbooru-search-options">
            <p id="danbooru-search-help">
              国内节点优先 · 失败自动回退国际节点 · 成功结果缓存一天
            </p>
            <div className="danbooru-nsfw-option">
              <span id="danbooru-nsfw-label">包含成人标签</span>
              <Switch
                checked={showNsfw}
                onChange={changeNsfwSetting}
                disabled={loading}
                size="small"
                aria-labelledby="danbooru-nsfw-label"
              />
            </div>
          </div>
        </form>
        <div className="danbooru-attribution">
          <span>数据源：Danbooru 数据库</span>
          <span>服务提供：Danbooru Tag Searcher API</span>
          <span>搜索词会发送至标签搜索服务，不写入本站数据库。</span>
        </div>
        <DanbooruSearchHistory
          entries={historyEntries}
          loading={loading}
          onReplay={(entry) => {
            if (loading) return;
            setQuery(entry.query);
            setShowNsfw(entry.show_nsfw);
            void search({
              query: entry.query,
              limit: entry.limit,
              show_nsfw: entry.show_nsfw,
            });
          }}
          onRemove={(entry) => {
            if (!danbooruHistory.remove(entry))
              setNotice("历史记录已从当前页面删除，但浏览器不允许同步到本地存储。");
          }}
          onClear={() => {
            if (!danbooruHistory.clear())
              setNotice("历史记录已从当前页面清空，但浏览器不允许同步到本地存储。");
          }}
        />
      </Card>

      {notice ? (
        <p className="danbooru-notice" role="status">
          {notice}
        </p>
      ) : null}
      <div className="danbooru-dashboard-toolbar">
        {data && submitted ? <DanbooruSearchContext key={submitted.query} query={submitted.query} keywords={data.keywords} /> : null}
        <p>点击卡片选择标签，展开说明查看完整内容；四个板块可独立滚动。</p>
        {selectedResultTags.length > 0 ? (
          <div className="danbooru-selected-tags" aria-label="推荐依据">
            <span>推荐依据</span>
            {selectedResultTags.map((tag) => (
              <Tag key={tag.tag} size="small" variant="soft" color="app-teal"
                closable onClose={() => toggleRecommendationTag(tag.tag)}>{getDanbooruDisplayName(tag)}</Tag>
            ))}
            <Button type="link" size="small" onClick={() => {
              setSelectedTags([]);
              requestRecommendations([], [], showNsfw);
            }}>清空选择</Button>
          </div>
        ) : null}
      </div>
      <div className="danbooru-dashboard" aria-label="标签搜索与推荐四宫格">
        <DashboardPanel
          id="search-results"
          title="搜索结果"
          count={data?.results.length}
          busy={loading}
          description={data
            ? `${result?.cached ? "一天内缓存" : "实时搜索"} · ${data.node === "domestic" ? "国内节点" : "国际节点"} · 点击卡片选择推荐依据`
            : "输入描述寻找标签，点击卡片查看相关推荐"}
          action={data ? (
            <Button type="link" size="small" disabled={data.results.length === 0}
              icon={<CopyIcon {...icon} />} onClick={() => void copy(data.tags_all)}>复制全部</Button>
          ) : undefined}
        >
          {loading ? (
            <PanelState title="正在寻找匹配标签…" loading>服务繁忙时可能需要等待，节点切换会自动完成。</PanelState>
          ) : error ? (
            <PanelState title="搜索服务暂不可用" error action={
              <Button size="small" onClick={() => { if (submitted) void search(submitted); }}>重试搜索</Button>
            }>{error}</PanelState>
          ) : data ? (
            <>
              {draftChanged ? <p className="danbooru-draft-notice">搜索条件已修改，请重新搜索以更新结果。</p> : null}
              {data.results.length > 0 ? (
                <DanbooruResults data={data} onCopy={(text) => void copy(text)}
                  selectedTags={selectedTags} onToggleTag={toggleRecommendationTag} />
              ) : <PanelState title="暂时没有匹配的标签">试试更简短的描述，或更换中英文关键词。</PanelState>}
            </>
          ) : <PanelState title="从一段描述，找到合适的标签">这里搜索 Danbooru 数据库，不局限于本站已收录的标签。</PanelState>}
        </DashboardPanel>
        <DanbooruRecommendations
          result={recommendationResult}
          selectedTags={recommendationTags}
          loading={recommendationLoading}
          error={recommendationError}
          onCopy={(text) => void copy(text)}
          onRetry={() => requestRecommendations(recommendationTags, recommendationCategories, showNsfw)}
        />
      </div>
    </section>
  );
}
