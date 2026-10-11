import { describe, expect, test } from "bun:test";
import type { DanbooruImageSizes } from "../app/lib/character-image-types";
import {
  AI_TAG_IMAGE_LIMIT_PER_MINUTE,
  AI_TAG_IMAGE_MAX_CONCURRENCY,
  createAiTagImageEnricher,
  resolveAiImageTag,
} from "./ai-tag-images";

const sizes = (name: string): DanbooruImageSizes => ({
  preview: `https://cdn.donmai.us/180x180/${name}.jpg`,
  sample: `https://cdn.donmai.us/sample/${name}.jpg`,
  original: `https://cdn.donmai.us/original/${name}.jpg`,
});
const signal = () => new AbortController().signal;

describe("inline AI example images", () => {
  test("strips a leading artist: and rejects compound or operator tags", () => {
    expect(resolveAiImageTag(" Misaka Mikoto ")).toBe("misaka_mikoto");
    expect(resolveAiImageTag("artist: anmi")).toBe("anmi");
    expect(resolveAiImageTag("index_(toaru_majutsu_no_index)")).toBe(
      "index_(toaru_majutsu_no_index)",
    );
    for (const value of ["", "   ", "a,b", "rating:e", "*", "-klee", "~klee", "x".repeat(201)])
      expect(resolveAiImageTag(value)).toBeNull();
  });
  test("only decorates the leading results and leaves the rest null", async () => {
    const asked: string[] = [];
    const enrich = createAiTagImageEnricher({
      loadSizes: async (tag) => { asked.push(tag); return sizes(tag); },
    });
    const images = await enrich([{ tag: "a" }, { tag: "b" }, { tag: "c" }], 2, signal());
    expect(asked).toEqual(["a", "b"]);
    expect(images).toEqual([sizes("a"), sizes("b"), null]);
  });
  test("images=0, invalid tags and empty pages never reach the upstream", async () => {
    let calls = 0;
    const enrich = createAiTagImageEnricher({
      loadSizes: async (tag) => { calls += 1; return sizes(tag); },
    });
    expect(await enrich([{ tag: "a" }], 0, signal())).toEqual([null]);
    expect(await enrich([{ tag: "a,b" }, { tag: "rating:e" }], 2, signal())).toEqual([null, null]);
    expect(await enrich([], 5, signal())).toEqual([]);
    expect(calls).toBe(0);
  });
  test("a failed lookup resolves to null without failing the search", async () => {
    const enrich = createAiTagImageEnricher({
      loadSizes: async (tag) => {
        if (tag === "bad") throw new Error("upstream down");
        return sizes(tag);
      },
    });
    expect(await enrich([{ tag: "bad" }, { tag: "good" }], 2, signal())).toEqual([
      null, sizes("good"),
    ]);
  });
  test("bounds concurrency, shares the per-minute budget and resets after a minute", async () => {
    let active = 0;
    let peak = 0;
    let now = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const gated = createAiTagImageEnricher({
      now: () => now,
      loadSizes: async (tag) => {
        active += 1;
        peak = Math.max(peak, active);
        await gate;
        active -= 1;
        return sizes(tag);
      },
    });
    const results = Array.from({ length: AI_TAG_IMAGE_MAX_CONCURRENCY + 3 }, (_, i) => ({ tag: `t${i}` }));
    const job = gated(results, results.length, signal());
    expect(peak).toBe(AI_TAG_IMAGE_MAX_CONCURRENCY);
    release();
    await job;
    expect(peak).toBe(AI_TAG_IMAGE_MAX_CONCURRENCY);

    let calls = 0;
    const counted = createAiTagImageEnricher({
      now: () => now,
      loadSizes: async (tag) => { calls += 1; return sizes(tag); },
    });
    const page = Array.from({ length: 50 }, (_, i) => ({ tag: `t${i}` }));
    await counted(page, 50, signal());
    await counted(page, 50, signal());
    const spent = 100;
    expect(calls).toBe(spent);
    // Only the remaining lookups of the minute are spent; the rest stay null.
    const remaining = AI_TAG_IMAGE_LIMIT_PER_MINUTE - spent;
    const partial = await counted(page, 50, signal());
    expect(calls).toBe(AI_TAG_IMAGE_LIMIT_PER_MINUTE);
    expect(partial.filter((item) => item !== null)).toHaveLength(remaining);
    now += 60_000;
    await counted(page, 50, signal());
    expect(calls).toBe(AI_TAG_IMAGE_LIMIT_PER_MINUTE + 50);
  });
});
