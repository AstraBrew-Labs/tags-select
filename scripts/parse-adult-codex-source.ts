import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sources = [
  {
    id: "upper",
    label: "上卷",
    title: "所长色色NovalAI个人法典(上)",
    url: "https://nai-bot.pages.dev/法典/所长色色novalai个人法典上/",
    path: process.env.ADULT_CODEX_UPPER_HTML,
  },
  {
    id: "lower",
    label: "下卷",
    title: "所长色色NovalAI个人法典(下)",
    url: "https://nai-bot.pages.dev/法典/所长色色novalai个人法典下/",
    path: process.env.ADULT_CODEX_LOWER_HTML,
  },
] as const;

const outputPath = resolve(process.env.ADULT_CODEX_SOURCE ?? "data/adult-codex.json");

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
    ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’",
    ldquo: "“", rdquo: "”",
  };
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (raw, entity: string) => {
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] ?? raw;
    const code = entity[1].toLowerCase() === "x"
      ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : raw;
  });
}

function plainText(html: string) {
  return decodeHtml(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]*>/g, ""))
    .replace(/\r/g, "").trim();
}

function contentFragment(html: string) {
  const start = /<div\b[^>]*class=["'][^"']*\bsl-markdown-content\b[^"']*["'][^>]*>/i.exec(html);
  if (!start) throw new Error("未找到原页面的正文容器，停止导入。");
  const tail = html.slice(start.index);
  let depth = 0;
  for (const tag of tail.matchAll(/<\/?div\b[^>]*>/gi)) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return tail.slice(start[0].length, tag.index);
  }
  throw new Error("正文容器未闭合，停止导入。");
}

function stableId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 16)}`;
}

function parseSource(html: string, source: (typeof sources)[number]) {
  type RawEntry = { categoryAnchor: string; title: string; anchor: string; paragraphs: string[] };
  const fragment = contentFragment(
    html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ""),
  );
  const raw: RawEntry[] = [];
  const categories: { anchor: string; title: string }[] = [];
  let category: { anchor: string; title: string } | undefined;
  let entry: RawEntry | undefined;

  for (const match of fragment.matchAll(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>|<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    if (match[1]) {
      const title = plainText(match[3]);
      const anchor = decodeHtml(/\bid=["']([^"']+)["']/i.exec(match[2])?.[1] ?? title);
      if (!title || !anchor) continue;
      if (match[1] === "2") {
        category = { anchor, title };
        categories.push(category);
      }
      entry = category ? { categoryAnchor: category.anchor, title, anchor, paragraphs: [] } : undefined;
      if (entry) raw.push(entry);
    } else if (entry) {
      const paragraph = plainText(match[4]);
      if (paragraph) entry.paragraphs.push(paragraph);
    }
  }

  const categoryRows = categories.map((item) => ({
    id: stableId("adult-category", `${source.id}|${item.anchor}`),
    title: item.title,
    volumeId: source.id,
    count: 0,
    anchor: item.anchor,
  }));
  const categoryByAnchor = new Map(categoryRows.map((item) => [item.anchor, item]));
  const entries: {
    id: string; volumeId: string; categoryId: string; title: string; anchor: string;
    groups: { label: string; prompt: string }[]; notes: string[];
  }[] = [];

  for (const item of raw) {
    const categoryRow = categoryByAnchor.get(item.categoryAnchor);
    if (!categoryRow || !item.paragraphs.length) continue;
    let label = "";
    const groups: { label: string; prompt: string }[] = [];
    const notes: string[] = [];
    for (const paragraph of item.paragraphs) {
      if (!paragraph || /^[\s—\-＝=]+$/.test(paragraph) || /以下正文/.test(paragraph)) continue;
      if (!/[a-z]/i.test(paragraph) ||
        /^(?:ps\s*\d*\s*[:：]|注[：:]|说明[：:]|NAI[\d.]*时期[：:]?$)/i.test(paragraph)) {
        if (/^NAI[\d.]*时期/i.test(paragraph)) label = paragraph.replace(/[：:]$/, "");
        else notes.push(paragraph);
        continue;
      }
      if (paragraph.includes("：") && /[\u3400-\u9fff]/.test(paragraph)) {
        for (const line of paragraph.split("\n")) {
          const parts = /^([^：]+)：(.+)$/.exec(line.trim());
          if (parts && !/[\u3400-\u9fff]/.test(parts[1]) && /[a-z]/i.test(parts[1])) {
            groups.push({ label: parts[2].trim(), prompt: parts[1].trim() });
          } else if (line.trim()) notes.push(line.trim());
        }
        continue;
      }
      for (const line of paragraph.split("\n")) {
        const text = line.trim();
        if (!text) continue;
        const number = /^(\d+)[，、]\s*/.exec(text);
        groups.push({
          label: [label, `标签组 ${number?.[1] ?? groups.length + 1}`].filter(Boolean).join(" · "),
          prompt: number ? text.slice(number[0].length) : text,
        });
      }
    }
    if (!groups.length) {
      if (!notes.length) continue;
      groups.push({ label: "正文", prompt: notes.join("\n") });
      notes.length = 0;
    }
    entries.push({
      id: stableId("adult-entry", `${source.id}|${item.anchor}`),
      volumeId: source.id,
      categoryId: categoryRow.id,
      title: item.title,
      anchor: item.anchor,
      groups,
      notes,
    });
    categoryRow.count++;
  }

  return {
    entries,
    categories: categoryRows.filter((item) => item.count).map((item) => ({
      id: item.id, title: item.title, volumeId: item.volumeId, count: item.count,
    })),
  };
}

const parsed = [];
for (const source of sources) {
  if (!source.path) throw new Error(`请设置 ${source.id === "upper" ? "ADULT_CODEX_UPPER_HTML" : "ADULT_CODEX_LOWER_HTML"}。`);
  parsed.push({ source, parsed: parseSource(await readFile(resolve(source.path), "utf8"), source) });
}

const catalog = {
  version: 1 as const,
  volumes: sources.map(({ id, label, title, url }) => ({ id, label, title, url })),
  categories: parsed.flatMap(({ parsed: item }) => item.categories),
  entries: parsed.flatMap(({ parsed: item }) => item.entries),
  source: {
    author: "一般所长",
    capturedAt: new Date().toISOString(),
    importedAt: null,
    omittedCount: 0,
  },
};
await writeFile(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log({
  outputPath,
  categories: catalog.categories.length,
  entries: catalog.entries.length,
  groups: catalog.entries.reduce((sum, entry) => sum + entry.groups.length, 0),
});
