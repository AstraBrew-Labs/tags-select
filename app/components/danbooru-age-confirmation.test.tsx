import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Modal } from "animal-island-ui";
import DanbooruAgeConfirmation from "./danbooru-age-confirmation";

describe("adult age confirmation", () => {
  test("closed dialog is SSR safe and does not access document", () => {
    expect(renderToStaticMarkup(
      <DanbooruAgeConfirmation open={false} onConfirm={() => {}} onCancel={() => {}} />,
    )).toBe("");
  });

  test("uses native game modal with clear, distinct consent and decline actions", () => {
    const onConfirm = () => {};
    const onCancel = () => {};
    const dialog = DanbooruAgeConfirmation({ open: true, onConfirm, onCancel });
    expect(dialog.type).toBe(Modal);
    expect(dialog.props.open).toBe(true);
    expect(dialog.props.variant).toBe("game");
    expect(dialog.props.maskClosable).toBe(false);
    expect(dialog.props.typewriter).toBe(false);
    expect(dialog.props.onClose).toBe(onCancel);
    const body = renderToStaticMarkup(dialog.props.children);
    expect(body).toContain("你是否已经年满 18 岁");
    expect(body).toContain("不希望查看，请保持关闭");
    const actions = dialog.props.footer.props.children;
    expect(actions[0].props.onClick).toBe(onCancel);
    expect(actions[1].props.onClick).toBe(onConfirm);
    const footer = renderToStaticMarkup(dialog.props.footer);
    expect(footer).toContain("取消，保持关闭");
    expect(footer).toContain("我已年满 18 岁，开启");
  });
});
