"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Button, Card, Input, Pagination, Tag } from "animal-island-ui";
import { BookIcon, CopyIcon, ExternalLinkIcon, HelpCircleIcon, SearchIcon } from "naive-icons";
import {
  codexSourceLink, createCodexIndex, DIRECTOR_CODEX_URL,
  type CodexCatalog, type CodexEntry,
} from "../lib/director-codex";
import { useDirectorCodex } from "../lib/use-director-codex";

const icon = { color: "currentColor", size: 17, "aria-hidden": true } as const;
const PAGE_SIZE = 12;
export type CodexView = { query: string; categoryId: string; page: number };
export const INITIAL_CODEX_VIEW: CodexView = { query: "", categoryId: "all", page: 1 };
type ViewProps = {
  view: CodexView;
  onViewChange: (view: CodexView) => void;
  onLookup: (prompt: string) => void;
};

function CodexEntryCard({
  entry, categoryTitle, onCopy, onLookup,
}: {
  entry: CodexEntry; categoryTitle: string;
  onCopy: (text: string, title: string) => void;
  onLookup: (prompt: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<number[]>([]);
  const groups = showAll ? entry.groups : entry.groups.slice(0, 2);
  return (
    <Card className="codex-entry-card">
      <header className="codex-entry-heading">
        <div>
          <Tag size="small" variant="soft">{categoryTitle}</Tag>
          <h3>{entry.title}</h3>
        </div>
        <Button
          type="link" size="small" icon={<CopyIcon {...icon} />}
          aria-label={`复制${entry.title}的全部标签组`}
          onClick={() => onCopy(entry.groups.map((group) => group.prompt).join("\n"), entry.title)}
        >复制全部</Button>
      </header>
      {entry.notes.length ? (
        <div className="codex-notes">
          {entry.notes.map((note, index) => <p key={index}>{note}</p>)}
        </div>
      ) : null}
      <div className="codex-groups">
        {groups.map((group, index) => {
          const isExpanded = expanded.includes(index);
          return (
            <section className="codex-group" key={index} aria-label={`${entry.title} · ${group.label}`}>
              <div className="codex-group-heading">
                <h4>{group.label}</h4>
                <Button type="link" size="small" icon={<CopyIcon {...icon} />}
                  aria-label={`复制${entry.title} · ${group.label}`}
                  onClick={() => onCopy(group.prompt, `${entry.title} · ${group.label}`)}
                >复制</Button>
              </div>
              <p id={`codex-${entry.id}-${index}`}
                className={`codex-prompt${isExpanded ? " codex-prompt-expanded" : ""}`}
                tabIndex={0} aria-label={`${group.label}原始提示词，可选中复制`}
              >{group.prompt}</p>
              <div className="codex-group-actions">
                {group.prompt.length > 280 ? (
                  <Button type="text" size="small" aria-expanded={isExpanded}
                    aria-controls={`codex-${entry.id}-${index}`}
                    onClick={() => setExpanded((current) => isExpanded
                      ? current.filter((value) => value !== index) : [...current, index])}
                  >{isExpanded ? "收起标签组" : "展开标签组"}</Button>
                ) : null}
                <Button type="text" size="small" icon={<SearchIcon {...icon} />}
                  onClick={() => onLookup(group.prompt)}
                >查找组内标签</Button>
              </div>
            </section>
          );
        })}
      </div>
      <footer className="codex-entry-footer">
        {entry.groups.length > 2 ? (
          <Button type="text" size="small" aria-expanded={showAll}
            onClick={() => setShowAll((current) => !current)}
          >{showAll ? "收起其他标签组" : `展开其余 ${entry.groups.length - 2} 个标签组`}</Button>
        ) : <span>{entry.groups.length} 个标签组 · 保留原文权重</span>}
        <a href={codexSourceLink(entry.anchor)} target="_blank" rel="noopener noreferrer">
          原文 <ExternalLinkIcon {...icon} size={14} />
        </a>
      </footer>
    </Card>
  );
}

export function DirectorCodexPanel({
  data, loading, error, retry, view, onViewChange, onLookup,
}: ViewProps & {
  data: CodexCatalog | null; loading: boolean; error: string | null; retry: () => void;
}) {
  const [notice, setNotice] = useState("");
  const deferredQuery = useDeferredValue(view.query);
  const index = useMemo(() => data ? createCodexIndex(data) : null, [data]);
  const filtered = useMemo(
    () => index?.filter(deferredQuery, view.categoryId) ?? [],
    [index, deferredQuery, view.categoryId],
  );
  const categoryNames = useMemo(
    () => new Map(data?.categories.map((category) => [category.id, category.title]) ?? []), [data],
  );
  const page = Math.min(Math.max(1, view.page), Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  async function copy(text: string, title: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`已复制「${title}」的原始标签组。`);
    } catch {
      setNotice("无法访问剪贴板，请选中卡片内的提示词手动复制。");
    }
  }
  return (
    <section className="codex-library" aria-label="所长的个人法典">
      <Card className="codex-intro">
        <div className="codex-intro-heading">
          <BookIcon {...icon} size={30} />
          <div>
            <h2>所长的个人法典</h2>
            <p>按标题寻找灵感，整组复制，保留原文的权重与占位符。</p>
          </div>
          <a href={DIRECTOR_CODEX_URL} target="_blank" rel="noopener noreferrer">
            阅读原文 <ExternalLinkIcon {...icon} />
          </a>
        </div>
        <p className="codex-source-note">
          整理者：一般所长{data ? ` · 原文标注版本：${data.source.edition}` : ""}
          {" · 收录通用、非露骨内容，不含原页图片"}
        </p>
        {data ? <p className="codex-source-note">
          {data.categories.length} 个分类 · {data.entries.length.toLocaleString("en-US")} 个标题
          {" · 数据快照："}{data.source.capturedAt.slice(0, 10)} · API 数据缓存一周
        </p> : null}
      </Card>
      {loading ? (
        <div className="catalog-status" role="status">
          <BookIcon {...icon} size={34} /><h3>正在从数据库加载法典…</h3>
          <p>首次加载后缓存一周，下次优先读取浏览器缓存。</p>
        </div>
      ) : error || !data ? (
        <div className="catalog-status" role="alert">
          <HelpCircleIcon {...icon} size={34} /><h3>法典暂不可用</h3>
          <p>{error ?? "法典数据尚未导入。"}</p><Button onClick={retry}>重新加载法典</Button>
        </div>
      ) : (
        <div className="codex-workspace">
          <aside className="codex-sidebar" aria-label="法典分类">
            <h3>法典目录</h3>
            <nav className="codex-category-list">
              {[{ id: "all", title: "全部分类", count: data.entries.length }, ...data.categories].map((category) => (
                <Button key={category.id} type={view.categoryId === category.id ? "default" : "text"} block
                  aria-pressed={view.categoryId === category.id}
                  onClick={() => onViewChange({ ...view, categoryId: category.id, page: 1 })}
                >
                  <span className="codex-category-content">
                    <span className="codex-category-label">{category.title}</span>
                    <span className="codex-category-count">{category.count}</span>
                  </span>
                </Button>
              ))}
            </nav>
          </aside>
          <div className="codex-browser">
            <Input aria-label="搜索法典标题与标签组" value={view.query} allowClear
              onChange={(event) => onViewChange({ ...view, query: event.target.value, page: 1 })}
              onClear={() => onViewChange({ ...view, query: "", page: 1 })}
              prefix={<SearchIcon {...icon} />}
              placeholder="搜索标题、英文标签或使用备注，例如「水墨」「winter」"
            />
            <div className="codex-result-summary" role="status">
              <h3>{categoryNames.get(view.categoryId) ?? "全部分类"}</h3>
              <span>找到 {filtered.length.toLocaleString("en-US")} 个标题</span>
              {(view.query || view.categoryId !== "all") ? (
                <Button type="text" size="small" onClick={() => onViewChange(INITIAL_CODEX_VIEW)}>重置筛选</Button>
              ) : null}
            </div>
            {notice ? <p className="codex-notice" role="status">{notice}</p> : null}
            <div className="codex-results" aria-label="法典标签组" aria-busy={deferredQuery !== view.query}>
              {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((entry) => (
                <CodexEntryCard key={entry.id} entry={entry}
                  categoryTitle={categoryNames.get(entry.categoryId) ?? ""}
                  onCopy={(text, title) => void copy(text, title)} onLookup={onLookup}
                />
              ))}
            </div>
            {!filtered.length ? (
              <div className="lookup-empty">
                <SearchIcon {...icon} size={34} /><h3>没有找到对应的标题或标签组</h3>
                <p>试试更短的中文标题、英文标签，或切换到全部分类。</p>
                <Button onClick={() => onViewChange(INITIAL_CODEX_VIEW)}>浏览全部分类</Button>
              </div>
            ) : null}
            {filtered.length > PAGE_SIZE ? (
              <Pagination total={filtered.length} current={page} pageSize={PAGE_SIZE} variant="teal"
                onChange={(nextPage) => onViewChange({ ...view, page: nextPage })}
              />
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

export default function DirectorCodex(props: ViewProps) {
  const state = useDirectorCodex();
  return <DirectorCodexPanel {...props} {...state} />;
}
