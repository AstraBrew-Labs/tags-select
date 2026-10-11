"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Button, Drawer } from "animal-island-ui";
import { BookIcon, CopyIcon } from "naive-icons";
import PromptComposer, { type PromptComposerProps } from "./prompt-composer";

const mobileQuery = "(max-width: 680px)";
const icon = { size: 18, color: "currentColor", "aria-hidden": true } as const;
function subscribeToViewport(onChange: () => void) {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
const getMobileSnapshot = () => window.matchMedia(mobileQuery).matches;
const getServerSnapshot = () => false;

function MobilePromptDrawer(props: PromptComposerProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  return (
    <>
      <Button
        type="primary"
        className="mobile-prompt-trigger"
        aria-label={`我的提示词，已选 ${props.tags.length} 个标签`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={contentId}
        title="展开我的提示词"
        onClick={() => setOpen(true)}
      >
        <BookIcon {...icon} size={21} />
        <span>提示词</span>
        <span className="mobile-prompt-trigger-count">{props.tags.length}</span>
      </Button>
      <Drawer
        open={open}
        title="我的提示词"
        placement="right"
        width="min(420px, calc(100vw - 16px))"
        pushBackground={false}
        className="mobile-prompt-drawer"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button onClick={() => setOpen(false)}>继续选词</Button>
            <Button
              type="primary"
              disabled={!props.prompt}
              icon={<CopyIcon {...icon} />}
              onClick={props.onCopy}
            >
              复制提示词
            </Button>
          </>
        }
      >
        <div id={contentId}>
          <PromptComposer
            {...props}
            onClear={() => {
              // Close the focus trap before opening the clear-confirmation modal.
              setOpen(false);
              props.onClear();
            }}
          />
        </div>
      </Drawer>
    </>
  );
}

export default function ResponsivePromptComposer(props: PromptComposerProps) {
  const mobile = useSyncExternalStore(subscribeToViewport, getMobileSnapshot, getServerSnapshot);
  return mobile ? <MobilePromptDrawer {...props} /> : (
    <div className="desktop-prompt-composer">
      <PromptComposer {...props} />
    </div>
  );
}
