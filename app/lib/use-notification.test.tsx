import { describe, expect, spyOn, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Notification, type NotificationType } from "animal-island-ui";
import { useNotification } from "./use-notification";

function NotificationProbe({
  message,
  type,
}: {
  message: string | null;
  type?: NotificationType;
}) {
  useNotification(message, type);
  return <p>页面内容</p>;
}

describe("global notification hydration boundary", () => {
  test("server rendering never invokes the browser-only notification API", () => {
    const error = spyOn(Notification, "error");
    const info = spyOn(Notification, "info");
    try {
      for (const props of [
        { message: "网络连接失败" },
        { message: "输入已修改", type: "info" as const },
        { message: null },
      ]) {
        expect(renderToStaticMarkup(<NotificationProbe {...props} />)).toBe("<p>页面内容</p>");
      }
      expect(error).not.toHaveBeenCalled();
      expect(info).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      info.mockRestore();
    }
  });
});
