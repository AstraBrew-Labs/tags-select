import { describe, expect, test } from "bun:test";
import { selectMenuLayout } from "./select-menu-layout";

describe("viewport-safe select menu", () => {
  test("opens downward when there is enough space", () => {
    expect(
      selectMenuLayout(
        { top: 120, bottom: 164, left: 20 },
        { width: 1440, height: 900 },
      ),
    ).toEqual({ direction: "down", maxHeight: 320, maxWidth: 1408 });
  });
  test("opens upward near the bottom rather than leaving options offscreen", () => {
    const layout = selectMenuLayout(
      { top: 790, bottom: 834, left: 20 },
      { width: 1440, height: 900 },
    );
    expect(layout.direction).toBe("up");
    expect(layout.maxHeight).toBe(320);
  });
  test("bounds long lists and labels to the mobile viewport", () => {
    const layout = selectMenuLayout(
      { top: 250, bottom: 294, left: 50 },
      { width: 390, height: 430 },
    );
    expect(layout.direction).toBe("up");
    expect(layout.maxHeight).toBe(242);
    expect(layout.maxWidth).toBe(328);
  });
  test("stays below when the upper space is even smaller", () => {
    const layout = selectMenuLayout(
      { top: 20, bottom: 64, left: 20 },
      { width: 390, height: 180 },
    );
    expect(layout.direction).toBe("down");
    expect(layout.maxHeight).toBe(108);
  });
});
