"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button, Tabs } from "animal-island-ui";
import { ChevronLeftIcon, ChevronRightIcon } from "naive-icons";
import type { CatalogGroup } from "../lib/catalog-types";

export default function TagGroupTabs({
  category,
  categoryName,
  groups,
  totalCount,
  value,
  onChange,
  children,
}: {
  category: string;
  categoryName?: string;
  groups: readonly CatalogGroup[];
  totalCount: number;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: false, right: false });
  const categoryGroups = groups.filter((item) => item.categoryId === category);
  const activeKey = categoryGroups.some((item) => item.id === value)
    ? value
    : "all";

  useEffect(() => {
    const list = hostRef.current?.querySelector<HTMLElement>(
      ".group-tabs > [role='tablist']",
    );
    if (!list) return;
    const measure = () => {
      const next = {
        left: list.scrollLeft > 1,
        right: list.scrollLeft + list.clientWidth < list.scrollWidth - 1,
      };
      setScroll((current) =>
        current.left === next.left && current.right === next.right
          ? current
          : next,
      );
    };
    const frame = requestAnimationFrame(() => {
      const active = list.querySelector<HTMLElement>("[aria-selected='true']");
      if (active) {
        // Reveal only within the tab strip; do not move the page or card grid.
        const tabRect = active.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        if (tabRect.left < listRect.left)
          list.scrollLeft -= listRect.left - tabRect.left + 8;
        else if (tabRect.right > listRect.right)
          list.scrollLeft += tabRect.right - listRect.right + 8;
      }
      measure();
    });
    list.addEventListener("scroll", measure, { passive: true });
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(list);
    for (const tab of list.children) observer?.observe(tab);
    return () => {
      cancelAnimationFrame(frame);
      list.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [category, activeKey, groups]);

  function scrollTabs(direction: number) {
    const list = hostRef.current?.querySelector<HTMLElement>(
      ".group-tabs > [role='tablist']",
    );
    list?.scrollBy({ left: direction * list.clientWidth * 0.75 });
  }

  if (category === "all") return children;

  return (
    <div
      className="group-tabs-region"
      ref={hostRef}
      onKeyDown={(event) => {
        if (
          ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) &&
          (event.target as HTMLElement).closest("[role='tablist']")
        )
          event.stopPropagation();
      }}
    >
      <div className="group-tabs-heading">
        <span>子分组</span>
        {scroll.left || scroll.right ? (
          <div className="group-tabs-controls">
            <Button
              type="text"
              size="small"
              disabled={!scroll.left}
              aria-label="向左滚动子分组"
              title="向左滚动子分组"
              onClick={() => scrollTabs(-1)}
              icon={<ChevronLeftIcon size={18} color="currentColor" aria-hidden="true" />}
            />
            <Button
              type="text"
              size="small"
              disabled={!scroll.right}
              aria-label="向右滚动子分组"
              title="向右滚动子分组"
              onClick={() => scrollTabs(1)}
              icon={<ChevronRightIcon size={18} color="currentColor" aria-hidden="true" />}
            />
          </div>
        ) : null}
      </div>
      <Tabs
        className="group-tabs"
        aria-label={`${categoryName ?? "标签"}子分组`}
        activeKey={activeKey}
        onChange={onChange}
        shadow={false}
        items={[
          {
            key: "all",
            label: (
              <span className="group-tab-label">
                <span>全部分组</span>
                <span className="group-tab-count">{totalCount}</span>
              </span>
            ),
            children,
          },
          ...categoryGroups.map((item) => ({
            key: item.id,
            label: (
              <span className="group-tab-label">
                <span>{item.nameZh}</span>
                <span className="group-tab-count">{item.count}</span>
              </span>
            ),
            children,
          })),
        ]}
      />
    </div>
  );
}
