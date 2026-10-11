"use client";

import { useState, useSyncExternalStore } from "react";
import { Button, Notification, Tabs, Tooltip } from "animal-island-ui";
import { CopyIcon, DownloadIcon, LinkIcon } from "naive-icons";
import { AI_DOCUMENTS, buildAiDocument, type AiDocumentKey } from "../lib/ai-documents";

const iconProps = { size: 18, color: "currentColor", "aria-hidden": true } as const;
const subscribeToOrigin = () => () => {};
const getClientOrigin = () => window.location.origin;
const getServerOrigin = () => "";

function AiDocument({ item, origin }: { item: typeof AI_DOCUMENTS[number]; origin: string }) {
  const content = buildAiDocument(item.key, origin);
  const url = `${origin}${item.path}`;
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      Notification.success(`${label}已复制。`);
    } catch {
      Notification.error("无法访问剪贴板，请选中内容手动复制。");
    }
  }

  return (
    <>
      <div className="ai-document-toolbar">
        <a className="ai-document-url" href={item.path} target="_blank" rel="noreferrer">{url}</a>
        <div className="ai-document-actions">
          <Tooltip title="复制内容">
            <Button type="text" aria-label={`复制 ${item.name} 内容`} disabled={!origin}
              icon={<CopyIcon {...iconProps} />} onClick={() => void copy(content, "内容")}>
              <span className="ai-action-label">复制内容</span>
            </Button>
          </Tooltip>
          <Tooltip title="复制 URL">
            <Button type="text" aria-label={`复制 ${item.name} URL`} disabled={!origin}
              icon={<LinkIcon {...iconProps} />} onClick={() => void copy(url, "URL")}>
              <span className="ai-action-label">复制 URL</span>
            </Button>
          </Tooltip>
          <Tooltip title="下载文件">
            <Button type="text" aria-label={`下载 ${item.name}`} disabled={!origin}
              icon={<DownloadIcon {...iconProps} />} onClick={() => {
                const link = document.createElement("a");
                link.href = `${item.path}?download=1`;
                link.download = item.name;
                document.body.append(link);
                link.click();
                link.remove();
              }}>
              <span className="ai-action-label">下载文件</span>
            </Button>
          </Tooltip>
        </div>
      </div>
      <pre className="ai-document-preview" tabIndex={0} aria-label={`${item.name} 内容`}>
        <code>{content}</code>
      </pre>
    </>
  );
}

export default function AiSearch() {
  const origin = useSyncExternalStore(subscribeToOrigin, getClientOrigin, getServerOrigin);
  const [active, setActive] = useState<AiDocumentKey>("text");
  return (
    <section className="ai-search" aria-labelledby="ai-search-title">
      <div className="ai-search-heading">
        <h2 id="ai-search-title">AI 搜索</h2>
        <span className="ai-readonly-label">只读 · 无需 Key</span>
      </div>
      <dl className="ai-endpoints">
        <div>
          <dt>Tags API（内联例图）</dt>
          <dd><a href="/api/ai/tags?query=misaka_mikoto&images=8">{origin}/api/ai/tags</a></dd>
        </div>
        <div>
          <dt>MCP</dt>
          <dd><code>{origin}/api/ai/mcp</code></dd>
        </div>
      </dl>
      <Tabs
        className="ai-document-tabs"
        aria-label="AI 接入文件"
        shadow={false}
        activeKey={active}
        onChange={(key) => setActive(key as AiDocumentKey)}
        items={AI_DOCUMENTS.map((item) => ({
          key: item.key, label: item.name, children: <AiDocument item={item} origin={origin} />,
        }))}
      />
    </section>
  );
}
