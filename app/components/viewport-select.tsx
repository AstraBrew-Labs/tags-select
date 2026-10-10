"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Select, type SelectProps } from "animal-island-ui";
import { selectMenuLayout } from "../lib/select-menu-layout";

type MenuLayout = ReturnType<typeof selectMenuLayout>;

/** Keep the library Select intact; adapt only its floating menu's geometry. */
export default function ViewportSelect(props: SelectProps) {
  const root = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<MenuLayout | null>(null);
  useEffect(() => {
    const container = root.current;
    if (!container) return;
    function update() {
      const trigger =
        container?.querySelector<HTMLElement>('[role="combobox"]');
      if (!trigger || trigger.getAttribute("aria-expanded") !== "true") {
        setLayout((current) => (current === null ? current : null));
        return;
      }
      const next = selectMenuLayout(trigger.getBoundingClientRect(), {
        width: document.documentElement.clientWidth,
        height: window.innerHeight,
      });
      setLayout((current) =>
        current?.direction === next.direction &&
        current.maxHeight === next.maxHeight &&
        current.maxWidth === next.maxWidth
          ? current
          : next,
      );
    }
    function keepActiveOptionVisible() {
      const trigger =
        container?.querySelector<HTMLElement>('[role="combobox"]');
      const list = container?.querySelector<HTMLElement>('[role="listbox"]');
      const activeId = trigger?.getAttribute("aria-activedescendant");
      const option = activeId ? document.getElementById(activeId) : null;
      if (!list || !option || !list.contains(option)) return;
      const menuRect = list.getBoundingClientRect();
      const optionRect = option.getBoundingClientRect();
      if (optionRect.top < menuRect.top)
        list.scrollTop += optionRect.top - menuRect.top;
      else if (optionRect.bottom > menuRect.bottom)
        list.scrollTop += optionRect.bottom - menuRect.bottom;
    }
    const observer = new MutationObserver((records) => {
      update();
      // Do not reset manual scrolling; only follow keyboard/hover focus changes.
      if (
        records.some(
          (record) =>
            record.type === "childList" ||
            record.attributeName === "aria-activedescendant",
        )
      )
        keepActiveOptionVisible();
    });
    observer.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "aria-activedescendant"],
    });
    const resize = new ResizeObserver(update);
    resize.observe(container);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    update();
    return () => {
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, []);
  const style = layout
    ? ({
        "--select-menu-height": `${layout.maxHeight}px`,
        "--select-menu-width": `${layout.maxWidth}px`,
      } as CSSProperties)
    : undefined;
  return (
    <div
      ref={root}
      className="viewport-select"
      data-menu-open={Boolean(layout)}
      data-menu-direction={layout?.direction ?? "down"}
      style={style}
    >
      <Select {...props} />
    </div>
  );
}
