"use client";

import { Button, Card } from "animal-island-ui";
import { AnimatePresence, motion } from "motion/react";
import {
  BookIcon,
  CopyIcon,
  LeafIcon,
  MinusIcon,
  PlusIcon,
  RefreshIcon,
  TrashIcon,
} from "naive-icons";
import SelectedPromptTag from "./selected-prompt-tag";
import {
  clampWeightStep,
  MAX_WEIGHT_STEP,
  MIN_WEIGHT_STEP,
  type WeightSyntax,
} from "../lib/prompt-weights";
import type { NovelTag } from "../lib/tag-catalog";
const icon = { color: "currentColor", size: 17, "aria-hidden": true } as const;

export type PromptComposerProps = {
  tags: readonly NovelTag[];
  weights: Readonly<Record<string, number>>;
  syntax: WeightSyntax;
  prompt: string;
  onAdjust: (id: string, delta: number) => void;
  onReset: (id: string) => void;
  onRemove: (id: string) => void;
  onAdjustAll: (delta: number) => void;
  onResetAll: () => void;
  onSwitchSyntax: () => void;
  onClear: () => void;
  onCopy: () => void;
};

export default function PromptComposer({
  tags,
  weights,
  syntax,
  prompt,
  onAdjust,
  onReset,
  onRemove,
  onAdjustAll,
  onResetAll,
  onSwitchSyntax,
  onClear,
  onCopy,
}: PromptComposerProps) {
  const canDecrease = tags.some(
    (tag) => clampWeightStep(weights[tag.id] ?? 0) > MIN_WEIGHT_STEP,
  );
  const canIncrease = tags.some(
    (tag) => clampWeightStep(weights[tag.id] ?? 0) < MAX_WEIGHT_STEP,
  );
  const hasWeights = tags.some(
    (tag) => clampWeightStep(weights[tag.id] ?? 0) !== 0,
  );
  return (
    <section
      className="prompt-composer"
      aria-labelledby="prompt-composer-heading"
    >
      <Card className="prompt-composer-card">
        <header className="composer-header">
          <div className="composer-heading">
            <BookIcon {...icon} size={24} />
            <h2 id="prompt-composer-heading">我的提示词</h2>
            <span className="selected-count">{tags.length}</span>
            <span className="composer-caption">点击下方卡片，收集你的灵感</span>
          </div>
          <div className="composer-actions">
            <Button
              type="text"
              size="small"
              disabled={tags.length === 0}
              icon={<TrashIcon {...icon} size={15} />}
              onClick={onClear}
            >
              清空
            </Button>
            <Button
              type="primary"
              size="small"
              disabled={!prompt}
              icon={<CopyIcon {...icon} size={16} />}
              onClick={onCopy}
            >
              复制提示词
            </Button>
          </div>
        </header>
        <div className="composer-toolbar">
          <div
            className="composer-batch-tools"
            role="group"
            aria-label="全部词条权重调整"
          >
            <Button
              size="small"
              disabled={!canDecrease}
              icon={<MinusIcon {...icon} size={14} />}
              onClick={() => onAdjustAll(-1)}
            >
              全部减权
            </Button>
            <Button
              size="small"
              disabled={!canIncrease}
              icon={<PlusIcon {...icon} size={14} />}
              onClick={() => onAdjustAll(1)}
            >
              全部加权
            </Button>
            <Button
              type="text"
              size="small"
              disabled={!hasWeights}
              icon={<RefreshIcon {...icon} size={14} />}
              onClick={onResetAll}
            >
              重置权重
            </Button>
          </div>
          <div className="composer-syntax">
            <Button
              type="link"
              size="small"
              aria-label="加权符号切换"
              title="切换大括号与圆括号，保留每项权重档位"
              onClick={onSwitchSyntax}
            >
              加权符号切换{" "}
              <span className="composer-syntax-value">
                {syntax === "brackets" ? "{ }" : "( )"}
              </span>
            </Button>
            <span className="composer-weight-hint">
              [ ] 减权 · 点击词条恢复默认
            </span>
          </div>
        </div>
        <div className="prompt-token-list" aria-label="已选择的提示词">
          {tags.length === 0 ? (
            <p className="composer-empty">
              <LeafIcon {...icon} size={20} />
              还没有选词。从下方挑一个喜欢的标签开始吧。
            </p>
          ) : (
            <AnimatePresence initial={false}>
              {tags.map((tag) => (
                <motion.div
                  className="prompt-token-wrap"
                  key={tag.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <SelectedPromptTag
                    tag={tag}
                    step={weights[tag.id] ?? 0}
                    syntax={syntax}
                    onAdjust={(delta) => onAdjust(tag.id, delta)}
                    onReset={() => onReset(tag.id)}
                    onRemove={() => onRemove(tag.id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
        <div className="composer-preview">
          <span className="composer-preview-label">提示词预览</span>
          <div
            className={`prompt-preview${prompt ? " has-prompt" : ""}`}
            tabIndex={0}
            role="region"
            aria-label="提示词预览"
          >
            {prompt || "选中的标签会在这里组合，复制即可带走你的灵感。"}
          </div>
        </div>
      </Card>
    </section>
  );
}
