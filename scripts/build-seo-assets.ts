import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const icon = await readFile(join(root, "app/icon.svg"));
await mkdir(join(root, "public/icons"), { recursive: true });
await mkdir(join(root, "public/og"), { recursive: true });

await sharp(await readFile(join(root, "assets/seo/og.svg")))
  .png({ compressionLevel: 9 })
  .toFile(join(root, "public/og/novelai-tags.png"));

for (const size of [48, 192, 512]) {
  await sharp(icon).resize(size, size).png()
    .toFile(join(root, size === 48 ? "app/icon1.png" : `public/icons/icon-${size}.png`));
}
await sharp(icon).resize(180, 180).flatten({ background: "#e4f4ec" }).png()
  .toFile(join(root, "app/apple-icon.png"));

const safeIcon = await sharp(icon).resize(384, 384).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#e4f4ec" },
}).composite([{ input: safeIcon, left: 64, top: 64 }]).png()
  .toFile(join(root, "public/icons/icon-maskable-512.png"));

// An ICO directory embeds independently sized PNGs without downscaling in browsers.
const sizes = [16, 32, 48, 64];
const images = await Promise.all(sizes.map((size) =>
  sharp(icon).resize(size, size).png().toBuffer(),
));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, image] of images.entries()) {
  const entry = 6 + index * 16;
  directory[entry] = sizes[index];
  directory[entry + 1] = sizes[index];
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
}
await writeFile(join(root, "app/favicon.ico"), Buffer.concat([directory, ...images]));
console.log("Generated OG PNG, multi-size favicon, Apple icon and application icons.");
