"use client";

import { useMemo, useState } from "react";
import { Button, Card, Image, Pagination, Tag } from "animal-island-ui";
import {
  BookIcon,
  CheckIcon,
  HelpCircleIcon,
  LeafIcon,
  SearchIcon,
  StarIcon,
  TrashIcon,
} from "naive-icons";
import type { createTagCatalog } from "../lib/tag-catalog";

type Props = {
  catalog: ReturnType<typeof createTagCatalog>;
  loading: boolean;
  error: string | null;
  retry: () => void;
  input: string;
  submitted: string;
  onInputChange: (value: string) => void;
  onSubmit: (value: string) => void;
  selected: readonly string[];
  favorites: readonly string[];
  onAdd: (ids: string[]) => void;
  onFavorite: (id: string) => void;
  onShowGenerator: () => void;
};
const PAGE_SIZE = 24;
const icon = { color: "currentColor", size: 18, "aria-hidden": true } as const;

export default function PromptLookup({
  catalog,
  loading,
  error,
  retry,
  input,
  submitted,
  onInputChange,
  onSubmit,
  selected,
  favorites,
  onAdd,
  onFavorite,
  onShowGenerator,
}: Props) {
  const [page, setPage] = useState(1);
  const result = useMemo(
    () => catalog.lookupPrompt(submitted),
    [catalog, submitted],
  );
  const categoryNames = useMemo(
    () =>
      new Map(
        catalog.categories.map((category) => [category.id, category.name]),
      ),
    [catalog],
  );
  const groupNames = useMemo(
    () => new Map(catalog.groups.map((group) => [group.id, group.nameZh])),
    [catalog],
  );
  const matched = result.items.filter((item) => item.matches.length > 0);
  const unmatched = result.items.filter((item) => item.matches.length === 0);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(matched.length / PAGE_SIZE)),
  );
  const allMatchedIds = [
    ...new Set(
      matched.flatMap((item) => item.matches.map(({ tag }) => tag.id)),
    ),
  ];
  const newIds = allMatchedIds.filter((id) => !selected.includes(id));
  function submit() {
    onSubmit(input);
    setPage(1);
  }
  return (
    <section className="lookup-workspace" aria-label="提示词查找工作区">
      <Card className="lookup-input-card">
        <div className="lookup-input-heading">
          <span className="lookup-heading-icon">
            <SearchIcon {...icon} size={24} />
          </span>
          <div>
            <h2>这串提示词，描绘了什么？</h2>
            <p>粘贴已有的 tags，逐项查看英文、中文含义和所属分类。</p>
          </div>
        </div>
        <label className="lookup-input-label" htmlFor="prompt-lookup-input">
          待查找的提示词组
        </label>
        {/* The library has no multiline input; this app-specific textarea uses its tokens. */}
        <textarea
          id="prompt-lookup-input"
          className="lookup-textarea"
          value={input}
          onChange={(event) => onInputChange(event.target.value)}
          maxLength={100_000}
          rows={5}
          placeholder="例如：1girl, solo, {long hair}, (smile:1.2), watercolor"
          aria-describedby="lookup-input-help"
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              if (!loading && !error && input.trim()) submit();
            }
          }}
        />
        <p id="lookup-input-help" className="lookup-input-help">
          逗号或换行分隔 · 支持常见权重括号 · Ctrl / ⌘ + Enter 查找
        </p>
        <div className="lookup-input-actions">
          <Button
            type="primary"
            icon={<SearchIcon {...icon} />}
            disabled={loading || Boolean(error) || !input.trim()}
            onClick={submit}
          >
            查找提示词
          </Button>
          <Button
            type="text"
            icon={<TrashIcon {...icon} />}
            disabled={!input && !submitted}
            onClick={() => {
              onInputChange("");
              onSubmit("");
              setPage(1);
            }}
          >
            清空输入
          </Button>
          <Button
            type="link"
            onClick={() => {
              const sample =
                "1girl, solo, {long hair}, (smile:1.2), watercolor, unknown_tag";
              onInputChange(sample);
              onSubmit(sample);
              setPage(1);
            }}
          >
            试试示例
          </Button>
        </div>
      </Card>
      {loading ? (
        <div className="catalog-status" role="status">
          <LeafIcon {...icon} size={34} />
          <h3>正在加载标签库…</h3>
          <p>加载完成后即可查找，不会上传你输入的提示词。</p>
        </div>
      ) : error ? (
        <div className="catalog-status" role="alert">
          <HelpCircleIcon {...icon} size={34} />
          <h3>标签库暂不可用</h3>
          <p>{error}</p>
          <Button onClick={retry}>重新加载</Button>
        </div>
      ) : !submitted.trim() ? (
        <div className="lookup-empty">
          <BookIcon {...icon} size={38} />
          <h3>从一串提示词，读懂一幅画面</h3>
          <p>输入后点击“查找提示词”。查找仅在浏览器中进行，不调用图片模型。</p>
        </div>
      ) : (
        <>
          <div className="lookup-summary" role="status">
            <div>
              <h2>查找结果</h2>
              <p>
                解析 {result.total} 项 · 匹配 {result.matched} 项 · 未匹配{" "}
                {result.unmatched} 项
                {result.duplicates > 0
                  ? ` · 合并 ${result.duplicates} 个重复项`
                  : ""}
              </p>
              {input !== submitted ? (
                <p className="lookup-draft-note">
                  输入已修改，请再次查找以更新结果。
                </p>
              ) : null}
            </div>
            <div className="lookup-summary-actions">
              <Button
                disabled={newIds.length === 0}
                onClick={() => onAdd(newIds)}
              >
                加入全部匹配词条
              </Button>
              <Button type="link" onClick={onShowGenerator}>
                查看生成器{selected.length ? `（${selected.length}）` : ""}
              </Button>
            </div>
          </div>
          {matched.length > 0 ? (
            <div className="lookup-results">
              {matched
                .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                .map((item) => (
                  <Card key={item.normalized} className="lookup-result-card">
                    <header className="lookup-result-heading">
                      <h3 title={item.input}>{item.term}</h3>
                      {item.occurrences > 1 ? (
                        <Tag size="small" variant="soft">
                          出现 {item.occurrences} 次
                        </Tag>
                      ) : null}
                    </header>
                    {item.matches.length > 1 ? (
                      <p className="lookup-match-count">
                        词库中有 {item.matches.length}{" "}
                        个对应条目，请按分类确认。
                      </p>
                    ) : null}
                    {item.matches.map(({ tag, kind }) => (
                      <div className="lookup-match" key={tag.id}>
                        {tag.imageUrl ? (
                          <div className="lookup-match-image">
                            <Image
                              src={tag.imageUrl}
                              alt={`${tag.translation.trim() || tag.name}画风参考`}
                              variant="bordered"
                              color="default"
                              width="100%"
                              height={130}
                              lazy
                              preview={false}
                            />
                          </div>
                        ) : null}
                        <div className="lookup-match-copy">
                          {tag.translation.trim() ? (
                            <p className="lookup-translation">
                              {tag.translation}
                            </p>
                          ) : null}
                          <p className="lookup-category">
                            {categoryNames.get(tag.category)}
                            <span> / </span>
                            {groupNames.get(tag.group)}
                          </p>
                          {kind === "component" ? (
                            <>
                              <Tag
                                size="small"
                                color="app-orange"
                                variant="soft"
                              >
                                组合词条中的一项
                              </Tag>
                              <p className="lookup-composite">
                                完整词条：{tag.name}
                              </p>
                            </>
                          ) : null}
                          {tag.note ? (
                            <p className="lookup-source-note">{tag.note}</p>
                          ) : null}
                        </div>
                        <div className="lookup-match-actions">
                          <Button
                            type="link"
                            size="small"
                            icon={
                              <StarIcon
                                {...icon}
                                fill={
                                  favorites.includes(tag.id)
                                    ? "var(--animal-warning-color-active)"
                                    : "none"
                                }
                              />
                            }
                            aria-label={`${favorites.includes(tag.id) ? "取消收藏" : "收藏"} ${tag.name}`}
                            aria-pressed={favorites.includes(tag.id)}
                            onClick={() => onFavorite(tag.id)}
                          />
                          <Button
                            size="small"
                            disabled={selected.includes(tag.id)}
                            icon={
                              selected.includes(tag.id) ? (
                                <CheckIcon {...icon} size={15} />
                              ) : undefined
                            }
                            onClick={() => onAdd([tag.id])}
                          >
                            {selected.includes(tag.id)
                              ? "已加入"
                              : "加入生成器"}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </Card>
                ))}
            </div>
          ) : (
            <div className="lookup-empty">
              <SearchIcon {...icon} size={34} />
              <h3>这串提示词还没有匹配到词库</h3>
              <p>
                可能是词库暂未收录，或是自定义描述。未匹配不代表提示词无效。
              </p>
            </div>
          )}
          {matched.length > PAGE_SIZE ? (
            <div className="tag-pagination">
              <Pagination
                total={matched.length}
                current={currentPage}
                pageSize={PAGE_SIZE}
                variant="teal"
                onChange={(value) => setPage(value)}
              />
            </div>
          ) : null}
          {unmatched.length > 0 ? (
            <Card className="lookup-unmatched" type="dashed">
              <h3>
                未匹配的提示词 <span>{unmatched.length}</span>
              </h3>
              <p>
                以下词尚未在当前词库找到，不代表无效；我们不会猜测翻译或自动替换。
              </p>
              <div className="lookup-unmatched-tags">
                {unmatched.map((item) => (
                  <Tag key={item.normalized} variant="outlined" color="default">
                    {item.term}
                    {item.occurrences > 1 ? `（${item.occurrences} 次）` : ""}
                  </Tag>
                ))}
              </div>
            </Card>
          ) : null}
          {matched.some((item) =>
            item.matches.some((match) => match.kind === "component"),
          ) ? (
            <p className="lookup-composite-note">
              组合词条会展示完整原始值，加入生成器时也会加入完整词条，而非仅加入其中一项。
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
