import { ExternalLinkIcon } from "naive-icons";

/** 开源仓库地址，供关于弹窗与页脚共用，避免多处硬编码。 */
export const REPO_URL = "https://github.com/AstraBrew-Labs/tags-select";
export const REPO_NAME = "AstraBrew-Labs/tags-select";

const linkIconProps = {
  color: "currentColor",
  size: 16,
  "aria-hidden": true,
} as const;

export default function AboutSite() {
  return (
    <div className="help-content about-content">
      <p>
        NovelAI Tags
        选择器是一款非官方的 NovelAI 绘画提示词辅助工具，帮助你查找、组合与整理标签，
        不会调用绘画模型或生成图片。标签与法典内容整理自互联网公开数据，仅供创作参考。
      </p>
      <section aria-labelledby="about-features">
        <h3 id="about-features">主要功能</h3>
        <ul>
          <li>
            <strong>发现标签</strong>：按原站分类与子分组浏览，支持中英文搜索、权重调整与一键复制。
          </li>
          <li>
            <strong>搜索标签</strong>：通过 Danbooru Tag Searcher API 查询互联网标签与推荐画师。
          </li>
          <li>
            <strong>AI 搜索</strong>：提供 llm.txt、Skill、MCP 与 OpenAPI，方便 AI 客户端接入本站标签库。
          </li>
          <li>
            <strong>个人法典与成人法典</strong>：收录一般所长整理的配方，可按标题查找并整组复制。
          </li>
        </ul>
      </section>
      <section aria-labelledby="about-open-source">
        <h3 id="about-open-source">开源仓库</h3>
        <p>本站完全开源，欢迎提交 Issue、Pull Request，或前往仓库点一个 Star 支持。</p>
        <a
          className="about-repo"
          href={REPO_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          <ExternalLinkIcon {...linkIconProps} />
          <span className="about-repo-body">
            <strong>GitHub · {REPO_NAME}</strong>
            <small>{REPO_URL}</small>
          </span>
        </a>
      </section>
      <p className="help-caveat">
        本站与 NovelAI 官方没有隶属关系。标签例图由 Danbooru
        提供，可能与标签本身的含义无关，仅供参考。
      </p>
    </div>
  );
}
