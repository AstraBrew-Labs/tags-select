"use client";

import { useId } from "react";
import { Button, Card, Image } from "animal-island-ui";
import { CopyIcon, ImageIcon, StarIcon } from "naive-icons";
import type { NovelTag } from "../lib/tag-catalog";
import { useTagImage } from "../lib/use-tag-image";

export type TagCardProps = {
  tag: NovelTag;
  selected: boolean;
  favorite: boolean;
  disabled?: boolean;
  onSelect: () => void;
  onFavorite: () => void;
  onCopy: () => void;
};

/** Library-owned surfaces and controls; custom CSS handles composition only. */
export default function TagCard({
  tag,
  selected,
  favorite,
  disabled = false,
  onSelect,
  onFavorite,
  onCopy,
}: TagCardProps) {
  const titleId = useId();
  const translation = tag.translation.trim();
  const title = translation || tag.name;
  const favoriteLabel = `${favorite ? "取消收藏" : "收藏"} ${tag.name}`;
  const localImage = tag.category === "illustrator" ? tag.imageUrl : undefined;
  const { hostRef, imageUrl, loading, error } = useTagImage(
    tag.name,
    !localImage && !disabled,
  );
  return (
    <article
      className="tag-tile"
      aria-labelledby={titleId}
      data-tag-id={tag.id}
      data-selected={selected}
      data-disabled={disabled}
    >
      <Card
        className="tag-card"
        pattern="none"
        color={selected && !disabled ? "app-teal" : "default"}
        hoverable={!disabled}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-pressed={selected}
        aria-disabled={disabled}
        aria-labelledby={titleId}
        title={disabled ? "不可选择" : undefined}
        onClick={() => {
          if (!disabled) onSelect();
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!disabled && !event.repeat) onSelect();
          }
        }}
      >
        <div className="tag-card-example">
          <div ref={hostRef} className="tag-card-media">
            {localImage ? (
              <Image
                src={localImage}
                alt={`${title}画风参考`}
                variant="bordered"
                color="default"
                width="100%"
                height={172}
                lazy
                preview={false}
              />
            ) : imageUrl ? (
              <Image
                src={imageUrl}
                alt={`${title} Danbooru 例图，仅供参考`}
                variant="bordered"
                color="default"
                width="100%"
                height={172}
                lazy
                preview={false}
              />
            ) : (
              <div className="tag-card-media-empty">
                <ImageIcon size={30} color="currentColor" aria-hidden="true" />
                <span>
                  {loading
                    ? "正在加载参考图…"
                    : error
                      ? "参考图请求失败"
                      : "暂无 Danbooru 参考图"}
                </span>
              </div>
            )}
          </div>
          <p className="tag-card-image-source">
            {localImage ? "本地画风参考" : "Danbooru 例图 · 仅供参考"}
          </p>
        </div>
        <header className="tag-card-copy">
          <h3 id={titleId} className="tag-card-title" title={title}>
            {title}
          </h3>
          {translation ? (
            <p className="tag-card-prompt" title={tag.name}>
              {tag.name}
            </p>
          ) : null}
          {tag.note ? (
            <p className="tag-card-note" title={tag.note}>
              {tag.note}
            </p>
          ) : null}
        </header>
      </Card>
      <div className="tag-card-favorite-wrap">
        <Button
          type="link"
          size="small"
          className="tag-card-copy-button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (!disabled) onCopy();
          }}
          aria-label={`复制 ${tag.name}`}
          title={`复制 ${tag.name}`}
          icon={<CopyIcon size={17} color="currentColor" aria-hidden="true" />}
        />
        <Button
          type="link"
          size="small"
          className="tag-card-favorite"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            if (!disabled) onFavorite();
          }}
          aria-pressed={favorite}
          aria-label={favoriteLabel}
          title={favoriteLabel}
          icon={
            <StarIcon
              size={19}
              color={
                favorite
                  ? "var(--animal-warning-color-active)"
                  : "var(--animal-text-color-secondary)"
              }
              fill={favorite ? "var(--animal-warning-color-active)" : "none"}
              aria-hidden="true"
            />
          }
        />
      </div>
    </article>
  );
}
