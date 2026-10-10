"use client";

import { Button, Modal } from "animal-island-ui";

export default function DanbooruAgeConfirmation({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={open}
      variant="game"
      title="成人标签 · 年龄确认"
      width={480}
      typewriter={false}
      maskClosable={false}
      onClose={onCancel}
      footer={
        <div className="danbooru-age-actions">
          <Button onClick={onCancel}>取消，保持关闭</Button>
          <Button type="primary" onClick={onConfirm}>我已年满 18 岁，开启</Button>
        </div>
      }
    >
      <div className="danbooru-age-content">
        <p>开启后，搜索结果及相关推荐可能包含成人标签，仅适用于年满 18 岁的用户。</p>
        <p><strong>你是否已经年满 18 岁？</strong></p>
        <p className="danbooru-age-help">
          确认后会在当前浏览器记住开启状态；关闭时也会保存，下次访问按你的选择恢复。
          未满 18 岁或不希望查看，请保持关闭。
        </p>
      </div>
    </Modal>
  );
}
