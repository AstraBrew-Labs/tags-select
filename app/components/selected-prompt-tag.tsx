"use client";
import { Button, Tag } from "animal-island-ui";
import { CloseIcon, MinusIcon, PlusIcon } from "naive-icons";
import {
  clampWeightStep,
  formatWeightedTag,
  MAX_WEIGHT_STEP,
  MIN_WEIGHT_STEP,
  type WeightSyntax,
} from "../lib/prompt-weights";
import type { NovelTag } from "../lib/tag-catalog";
const icon = { size: 14, color: "currentColor", "aria-hidden": true } as const;

/** A single horizontal token, not a vertical card with a separate control row. */
export default function SelectedPromptTag({
  tag,
  step,
  syntax,
  onAdjust,
  onReset,
  onRemove,
}: {
  tag: NovelTag;
  step: number;
  syntax: WeightSyntax;
  onAdjust: (delta: number) => void;
  onReset: () => void;
  onRemove: () => void;
}) {
  const level = clampWeightStep(step);
  const formatted = formatWeightedTag(tag.name, level, syntax);
  return (
    <div
      className="selected-prompt-item"
      data-tag-id={tag.id}
      data-weight-step={level}
      role="group"
      aria-label={`${tag.name} 权重调整`}
    >
      <Button
        type="link"
        size="small"
        className="prompt-token-button"
        aria-label={`${tag.name} 减权`}
        title="减权一档"
        disabled={level <= MIN_WEIGHT_STEP}
        icon={<MinusIcon {...icon} />}
        onClick={() => onAdjust(-1)}
      />
      <Button
        type="link"
        size="small"
        className="prompt-token-label"
        aria-label={`${tag.name} 重置权重`}
        title={`${formatted} · 点击恢复默认权重`}
        onClick={onReset}
      >
        <Tag variant="soft" color={level < 0 ? "app-orange" : "app-teal"}>
          <span className="selected-prompt-name">{formatted}</span>
        </Tag>
      </Button>
      <Button
        type="link"
        size="small"
        className="prompt-token-button"
        aria-label={`${tag.name} 加权`}
        title="加权一档"
        disabled={level >= MAX_WEIGHT_STEP}
        icon={<PlusIcon {...icon} />}
        onClick={() => onAdjust(1)}
      />
      <Button
        type="link"
        size="small"
        className="prompt-token-button prompt-token-remove"
        aria-label={`移除 ${tag.name}`}
        title="移除词条"
        icon={<CloseIcon {...icon} />}
        onClick={onRemove}
      />
    </div>
  );
}
