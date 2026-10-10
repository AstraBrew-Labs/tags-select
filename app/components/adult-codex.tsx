"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Button, Card, Input, Notification, Pagination, Tag } from "animal-island-ui";
import {
  BookIcon,
  CopyIcon,
  ExternalLinkIcon,
  HelpCircleIcon,
  SearchIcon,
} from "naive-icons";
import {
  ADULT_CODEX_AUTHOR,
  adultCodexSourceLink,
  createAdultCodexIndex,
  type AdultCodexCatalog,
  type AdultCodexEntry,
} from "../lib/adult-codex";
import { useAdultCodex } from "../lib/use-adult-codex";
import { useNotification } from "../lib/use-notification";

const icon = { color: "currentColor", size: 17, "aria-hidden": true } as const;
const PAGE_SIZE = 12;

export type AdultCodexView = {
  query: string;
  categoryId: string;
  volumeId: string;
  page: number;
};
export const INITIAL_ADULT_CODEX_VIEW: AdultCodexView = {
  query: "",
  categoryId: "all",
  volumeId: "all",
  page: 1,
};

type ViewProps = {
  view: AdultCodexView;
  onViewChange: (view: AdultCodexView) => void;
  onLookup: (prompt: string) => void;
};

function AdultCodexEntryCard({
  entry,
  categoryTitle,
  volumeLabel,
  onCopy,
  onLookup,
}: {
  entry: AdultCodexEntry;
  categoryTitle: string;
  volumeLabel: string;
  onCopy: (text: string, title: string) => void;
  onLookup: (prompt: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const groups = showAll ? entry.groups : entry.groups.slice(0, 2);

  return (
    <Card className="codex-entry-card adult-codex-entry-card">
      <header className="codex-entry-heading">
        <div>
          <div className="adult-codex-entry-meta">
            <Tag size="small" variant="soft">{volumeLabel}</Tag>
            <Tag size="small" variant="soft">{categoryTitle}</Tag>
          </div>
          <h3>{entry.title}</h3>
        </div>
        <Button
          type="link"
          size="small"
          icon={<CopyIcon {...icon} />}
          aria-label={`复制${entry.title}的全部标签组`}
          onClick={() => onCopy(entry.groups.map((group) => group.prompt).join("\n"), entry.title)}
        >
          复制全部
        </Button>
      </header>
      {entry.notes.length ? (
        <div className="codex-notes">
          {entry.notes.map((note, index) => <p key={index}>{note}</p>)}
        </div>
      ) : null}
      <div className="codex-groups">
        {groups.map((group, index) => {
          const isExpanded = expanded.includes(index);
          const promptId = `adult-codex-${entry.id}-${index}`;
          return (
            <section className="codex-group" key={index} aria-label={`${entry.title} · ${group.label}`}>
              <div className="codex-group-heading">
                <h4>{group.label}</h4>
                <Button
                  type="link"
                  size="small"
                  icon={<CopyIcon {...icon} />}
                  aria-label={`复制${entry.title} · ${group.label}`}
                  onClick={() => onCopy(group.prompt, `${entry.title} · ${group.label}`)}
                >
                  复制
                </Button>
              </div>
              <p
                id={promptId}
                className={`codex-prompt${isExpanded ? " codex-prompt-expanded" : ""}`}
                tabIndex={0}
                aria-label={`${group.label}原始提示词，可选中复制`}
              >
                {group.prompt}
              </p>
              <div className="codex-group-actions">
                {group.prompt.length > 280 ? (
                  <Button
                    type="text"
                    size="small"
                    aria-expanded={isExpanded}
                    aria-controls={promptId}
                    onClick={() => setExpanded((current) => isExpanded
                      ? current.filter((value) => value !== index)
                      : [...current, index])}
                  >
                    {isExpanded ? "收起标签组" : "展开标签组"}
                  </Button>
                ) : null}
                <Button
                  type="text"
                  size="small"
                  icon={<SearchIcon {...icon} />}
                  onClick={() => onLookup(group.prompt)}
                >
                  查找组内标签
                </Button>
              </div>
            </section>
          );
        })}
      </div>
      <footer className="codex-entry-footer">
        {entry.groups.length > 2 ? (
          <Button
            type="text"
            size="small"
            aria-expanded={showAll}
            onClick={() => setShowAll((current) => !current)}
          >
            {showAll ? "收起其他标签组" : `展开其余 ${entry.groups.length - 2} 个标签组`}
          </Button>
        ) : (
          <span>{entry.groups.length} 个标签组 · 保留原文权重</span>
        )}
        <a
          href={adultCodexSourceLink(entry.volumeId, entry.anchor)}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          原文 <ExternalLinkIcon {...icon} size={14} />
        </a>
      </footer>
    </Card>
  );
}

export function AdultCodexPanel({
  data,
  loading,
  error,
  retry,
  view,
  onViewChange,
  onLookup,
}: ViewProps & {
  data: AdultCodexCatalog | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}) {
  useNotification(loading ? null : error ?? (!data ? "成人法典数据尚未导入。" : null));
  const deferredQuery = useDeferredValue(view.query);
  const index = useMemo(() => data ? createAdultCodexIndex(data) : null, [data]);
  const filtered = useMemo(
    () => index?.filter(deferredQuery, view.categoryId, view.volumeId) ?? [],
    [index, deferredQuery, view.categoryId, view.volumeId],
  );
  const categoryNames = useMemo(
    () => new Map<string, string>(data?.categories.map((category) => [category.id, category.title]) ?? []),
    [data],
  );
  const volumeNames = useMemo(
    () => new Map<string, string>(data?.volumes.map((volume) => [volume.id, volume.label]) ?? []),
    [data],
  );
  const page = Math.min(
    Math.max(1, view.page),
    Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
  );

  async function copy(text: string, title: string) {
    try {
      await navigator.clipboard.writeText(text);
      Notification.success(`已复制「${title}」的原始标签组。`);
    } catch {
      Notification.error("无法访问剪贴板，请选中卡片内的提示词手动复制。");
    }
  }

  return (
    <section className="codex-library adult-codex" aria-label="所长的成人法典">
      <Card className="codex-intro">
        <div className="codex-intro-heading">
          <BookIcon {...icon} size={30} />
          <div>
            <h2>所长的成人法典</h2>
            <p>按标题和标签组查找，整组复制，保留原文的权重与占位符。</p>
          </div>
          <Tag size="small" variant="soft" color="app-red">18+</Tag>
        </div>
        <p className="codex-source-note">
          整理者：{ADULT_CODEX_AUTHOR} · 仅限成年用户查看；本站不展示原页图片。
        </p>
        {data ? (
          <p className="codex-source-note">
            {data.volumes.length} 卷 · {data.categories.length} 个章节 ·{" "}
            {data.entries.length.toLocaleString("en-US")} 个标题 · 数据快照：{data.source.capturedAt.slice(0, 10)}
          </p>
        ) : null}
      </Card>
      {loading ? (
        <div className="catalog-status" role="status">
          <BookIcon {...icon} size={34} />
          <h3>正在加载成人法典…</h3>
          <p>首次加载本站快照后，可直接在页面内搜索和复制。</p>
        </div>
      ) : error || !data ? (
        <div className="catalog-status">
          <HelpCircleIcon {...icon} size={34} />
          <h3>成人法典暂不可用</h3>
          <Button onClick={retry}>重新加载法典</Button>
        </div>
      ) : (
        <div className="codex-workspace">
          <aside className="codex-sidebar" aria-label="成人法典章节">
            <h3>法典目录</h3>
            <nav className="codex-category-list">
              <Button
                type={view.categoryId === "all" && view.volumeId === "all" ? "default" : "text"}
                block
                aria-pressed={view.categoryId === "all" && view.volumeId === "all"}
                onClick={() => onViewChange({ ...INITIAL_ADULT_CODEX_VIEW, query: view.query })}
              >
                <span className="codex-category-content">
                  <span className="codex-category-label">全部章节</span>
                  <span className="codex-category-count">{data.entries.length}</span>
                </span>
              </Button>
              {data.volumes.map((volume) => (
                <div className="adult-codex-volume-menu" key={volume.id}>
                  <h4>{volume.label}</h4>
                  {data.categories.filter((category) => category.volumeId === volume.id).map((category) => (
                    <Button
                      key={category.id}
                      type={view.categoryId === category.id ? "default" : "text"}
                      block
                      aria-pressed={view.categoryId === category.id}
                      onClick={() => onViewChange({
                        ...view, categoryId: category.id, volumeId: volume.id, page: 1,
                      })}
                    >
                      <span className="codex-category-content">
                        <span className="codex-category-label">{category.title}</span>
                        <span className="codex-category-count">{category.count}</span>
                      </span>
                    </Button>
                  ))}
                </div>
              ))}
            </nav>
          </aside>
          <div className="codex-browser">
            <Input
              aria-label="搜索成人法典标题与标签组"
              value={view.query}
              allowClear
              onChange={(event) => onViewChange({ ...view, query: event.target.value, page: 1 })}
              onClear={() => onViewChange({ ...view, query: "", page: 1 })}
              prefix={<SearchIcon {...icon} />}
              placeholder="搜索标题、英文标签或备注，例如「泳装」「missionary」"
            />
            <div className="codex-result-summary" role="status">
              <h3>
                {view.categoryId === "all"
                  ? (view.volumeId === "all" ? "全部章节" : `${volumeNames.get(view.volumeId) ?? ""} · 全部章节`)
                  : `${volumeNames.get(data.categories.find((item) => item.id === view.categoryId)?.volumeId ?? "") ?? ""} · ${categoryNames.get(view.categoryId) ?? ""}`}
              </h3>
              <span>找到 {filtered.length.toLocaleString("en-US")} 个标题</span>
              {(view.query || view.categoryId !== "all" || view.volumeId !== "all") ? (
                <Button type="text" size="small" onClick={() => onViewChange(INITIAL_ADULT_CODEX_VIEW)}>
                  重置筛选
                </Button>
              ) : null}
            </div>
            <div className="codex-results" aria-label="成人法典标签组" aria-busy={deferredQuery !== view.query}>
              {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((entry) => (
                <AdultCodexEntryCard
                  key={entry.id}
                  entry={entry}
                  categoryTitle={categoryNames.get(entry.categoryId) ?? ""}
                  volumeLabel={volumeNames.get(entry.volumeId) ?? ""}
                  onCopy={(text, title) => void copy(text, title)}
                  onLookup={onLookup}
                />
              ))}
            </div>
            {!filtered.length ? (
              <div className="lookup-empty">
                <SearchIcon {...icon} size={34} />
                <h3>没有找到对应的标题或标签组</h3>
                <p>试试更短的中文标题、英文标签，或切换到全部章节。</p>
                <Button onClick={() => onViewChange(INITIAL_ADULT_CODEX_VIEW)}>浏览全部章节</Button>
              </div>
            ) : null}
            {filtered.length > PAGE_SIZE ? (
              <Pagination
                total={filtered.length}
                current={page}
                pageSize={PAGE_SIZE}
                variant="teal"
                onChange={(nextPage) => onViewChange({ ...view, page: nextPage })}
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

export default function AdultCodex(props: ViewProps) {
  const state = useAdultCodex();
  return <AdultCodexPanel {...props} {...state} />;
}
