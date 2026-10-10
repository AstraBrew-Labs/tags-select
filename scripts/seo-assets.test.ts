import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { OG_IMAGE } from "../app/lib/seo";

const root = join(import.meta.dir, "..");

describe("committed SEO image assets", () => {
  test("sharing image is a lightweight, nonblank PNG with the declared dimensions", async () => {
    const bytes = await readFile(join(root, "public", OG_IMAGE.url));
    const image = sharp(bytes);
    expect(await image.metadata()).toMatchObject({
      format: "png", width: OG_IMAGE.width, height: OG_IMAGE.height,
    });
    expect(bytes.length).toBeLessThan(500_000);
    const stats = await image.stats();
    expect(stats.channels.some((channel) => channel.stdev > 20)).toBe(true);
    const source = await readFile(join(root, "assets/seo/og.svg"), "utf8");
    expect(source).toContain("NovelAI Tags");
    expect(source).toContain("选择器");
    expect(source).toContain("非官方社区辅助工具");
  });
  test("favicon contains multiple PNG resolutions including a 48px search icon", async () => {
    const bytes = await readFile(join(root, "app/favicon.ico"));
    expect(bytes.readUInt16LE(0)).toBe(0);
    expect(bytes.readUInt16LE(2)).toBe(1);
    expect(bytes.readUInt16LE(4)).toBe(4);
    for (const [index, size] of [16, 32, 48, 64].entries()) {
      const entry = 6 + index * 16;
      expect(bytes[entry]).toBe(size);
      expect(bytes[entry + 1]).toBe(size);
      const length = bytes.readUInt32LE(entry + 8);
      const offset = bytes.readUInt32LE(entry + 12);
      expect(await sharp(bytes.subarray(offset, offset + length)).metadata())
        .toMatchObject({ format: "png", width: size, height: size });
    }
  });
  test("apple and application icons have correct dimensions and opaque maskable background", async () => {
    for (const [path, size] of [
      ["app/apple-icon.png", 180],
      ["app/icon1.png", 48],
      ["public/icons/icon-192.png", 192],
      ["public/icons/icon-512.png", 512],
      ["public/icons/icon-maskable-512.png", 512],
    ] as const) {
      expect(await sharp(join(root, path)).metadata())
        .toMatchObject({ format: "png", width: size, height: size });
    }
    expect((await sharp(join(root, "app/apple-icon.png")).stats()).isOpaque).toBe(true);
    const { data, info } = await sharp(join(root, "public/icons/icon-maskable-512.png"))
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let opaque = true;
    let maxMarkRadius = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const pixel = (y * info.width + x) * info.channels;
        if (data[pixel + 3] !== 255) opaque = false;
        const differsFromBackground = Math.abs(data[pixel] - 228) > 2 ||
          Math.abs(data[pixel + 1] - 244) > 2 || Math.abs(data[pixel + 2] - 236) > 2;
        if (differsFromBackground)
          maxMarkRadius = Math.max(maxMarkRadius, Math.hypot(x + 0.5 - 256, y + 0.5 - 256));
      }
    }
    expect(opaque).toBe(true);
    expect(maxMarkRadius).toBeGreaterThan(0);
    expect(maxMarkRadius).toBeLessThan(205);
  });
});
