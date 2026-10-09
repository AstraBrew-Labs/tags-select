"use client";

import { Tag } from "animal-island-ui";
import { CheckIcon, StarIcon } from "naive-icons";
export type TagFilter = "all" | "popular" | "selected";
export function effectiveTagFilter(
  filter: TagFilter,
  selectedCount: number,
): TagFilter {
  return filter === "selected" && selectedCount === 0 ? "all" : filter;
}
export default function TagFilterBar({
  value,
  selectedCount,
  onChange,
}: {
  value: TagFilter;
  selectedCount: number;
  onChange: (filter: TagFilter) => void;
}) {
  const current = effectiveTagFilter(value, selectedCount);
  return (
    <div className="filter-chips" aria-label="标签筛选">
      <Tag
        onClick={() => onChange("all")}
        variant={current === "all" ? "soft" : "outlined"}
        color={current === "all" ? "app-teal" : "default"}
      >
        全部标签
      </Tag>
      <Tag
        onClick={() => onChange("popular")}
        variant={current === "popular" ? "soft" : "outlined"}
        color={current === "popular" ? "app-orange" : "default"}
      >
        <StarIcon size={14} color="currentColor" aria-hidden="true" />
        常用推荐
      </Tag>
      {selectedCount > 0 ? (
        <Tag
          onClick={() => onChange("selected")}
          variant={current === "selected" ? "soft" : "outlined"}
          color={current === "selected" ? "app-teal" : "default"}
        >
          <CheckIcon size={14} color="currentColor" aria-hidden="true" />
          已选择 {selectedCount}
        </Tag>
      ) : null}
    </div>
  );
}
