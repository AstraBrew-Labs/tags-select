import { describe, expect, test } from "bun:test";
import snapshot from "../../data/adult-codex.json";
import {
  ADULT_CODEX_VOLUMES,
  adultCodexSourceLink,
  createAdultCodexIndex,
  isAdultCodexCatalog,
} from "./adult-codex";

describe("adult codex catalog", () => {
  test("keeps the two source volumes in 上 / 下 order", () => {
    expect(ADULT_CODEX_VOLUMES.map((volume) => volume.id)).toEqual(["upper", "lower"]);
    expect(ADULT_CODEX_VOLUMES.map((volume) => volume.label)).toEqual(["上卷", "下卷"]);
    expect(ADULT_CODEX_VOLUMES.every((volume) => new URL(volume.url).protocol === "https:")).toBe(true);
  });

  test("validates the checked-in source snapshot", () => {
    expect(isAdultCodexCatalog(snapshot)).toBe(true);
    expect(snapshot.source.author).toBe("一般所长");
  });

  test("indexes title, category, volume and prompt text", () => {
    if (!isAdultCodexCatalog(snapshot)) throw new Error("fixture should validate");
    const index = createAdultCodexIndex(snapshot);
    const first = snapshot.entries[0];
    expect(index.filter(first.title.slice(0, 2))).toContainEqual(first);
    expect(index.filter(first.groups[0].prompt.split(",")[0])).toContainEqual(first);
    expect(index.filter("missing adult codex title")).toEqual([]);
    expect(adultCodexSourceLink(first.volumeId, first.anchor)).toContain(encodeURIComponent(first.anchor));
  });
});
