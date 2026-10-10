"use client";

import { useId, useState } from "react";
import { Button, Tag } from "animal-island-ui";
import { ClockIcon, CloseIcon, TrashIcon } from "naive-icons";
import {
  DANBOORU_HISTORY_LIMIT,
  getDanbooruHistoryEntryKey,
  type DanbooruHistoryEntry,
} from "../lib/danbooru-history";

const icon = { color: "currentColor", size: 16, "aria-hidden": true } as const;
const dates = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const RECENT_COUNT = 3;

export default function DanbooruSearchHistory({
  entries,
  loading,
  onReplay,
  onRemove,
  onClear,
}: {
  entries: readonly DanbooruHistoryEntry[];
  loading: boolean;
  onReplay: (entry: DanbooruHistoryEntry) => void;
  onRemove: (entry: DanbooruHistoryEntry) => void;
  onClear: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const visible = expanded ? entries : entries.slice(0, RECENT_COUNT);
  return (
    <section className="danbooru-history" aria-label="搜索历史">
      <header className="danbooru-history-header">
        <div className="section-label">
          <ClockIcon {...icon} />
          <h3>搜索历史</h3>
          <Tag size="small" variant="soft">{entries.length}</Tag>
        </div>
        {entries.length > 0 ? (
          <div className="danbooru-history-actions">
            {entries.length > RECENT_COUNT ? (
              <Button type="link" size="small" aria-expanded={expanded}
                aria-controls={listId} onClick={() => setExpanded((value) => !value)}>
                {expanded ? "收起历史" : `查看全部 ${entries.length} 条`}
              </Button>
            ) : null}
            <Button type="link" size="small" danger icon={<TrashIcon {...icon} />}
              onClick={onClear}>清空历史</Button>
          </div>
        ) : null}
      </header>
      {entries.length > 0 ? (
        <ul className="danbooru-history-list" id={listId}>
          {visible.map((entry) => (
            <li className="danbooru-history-entry" key={getDanbooruHistoryEntryKey(entry)}>
              <Button type="text" size="small" className="danbooru-history-query"
                disabled={loading}
                aria-label={`再次搜索：${entry.query}（${entry.show_nsfw ? "包含成人标签" : "仅安全标签"}）`}
                onClick={() => onReplay(entry)}>
                <span className="danbooru-history-query-text">{entry.query}</span>
                <span className="danbooru-history-meta">
                  <span>{entry.show_nsfw ? "包含成人标签" : "仅安全标签"}</span>
                  <time dateTime={new Date(entry.lastSearchedAt).toISOString()}>
                    {dates.format(entry.lastSearchedAt)}
                  </time>
                </span>
              </Button>
              <Button type="link" size="small" icon={<CloseIcon {...icon} />}
                aria-label={`删除搜索记录：${entry.query}（${entry.show_nsfw ? "包含成人标签" : "仅安全标签"}）`}
                title="删除这条搜索记录" onClick={() => onRemove(entry)} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="danbooru-history-empty">暂无搜索记录，搜索后会自动保存。</p>
      )}
      <p className="danbooru-history-help">
        仅在当前浏览器保存最近 {DANBOORU_HISTORY_LIMIT} 条，点击记录按原条件再次搜索。
      </p>
    </section>
  );
}
