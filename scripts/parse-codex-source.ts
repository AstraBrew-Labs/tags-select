import { createHash } from "node:crypto";
import { DIRECTOR_CODEX_URL, type CodexCatalog, type CodexEntry } from "../app/lib/director-codex";

// This import contains general-purpose, non-explicit prompts only. Reject the
// entire source entry, rather than removing individual words from a recipe.
const excludedContent = /(?:\b(?:nsfw|r[\s-]?18|hentai|porn(?:ographic)?|erotic|nude|nudity|naked|sex(?:ual|ually)?|intercourse|orgasm|orgasmic|cum|cumshot|semen|ejaculat\w*|masturbat\w*|penetrat\w*|fellatio|cunnilingus|blowjob|handjob|footjob|paizuri|pussy|penis|vagina|clitoris|genitals?|anal|anus|rape|raped|molest\w*|incest|bestiality|futanari|tentacle[_ ]sex|mating[_ ]press|spread[_ ]pussy|cameltoe|nipples?|areolae?|topless|bottomless|breast[_ ]?milk|lactation|breastfeeding|bondage|bdsm|shibari|ball[_ ]gag|sex[_ ]toy|dildo|vibrator|naughty|lewd|ecchi|pantyshot|upskirt|no[_ ]pant\w*|crotch[_ ]focus|pubic[_ ]hair|pubic|deepthroat|bukkake|ahegao|doujinshi|undressing|vulva|testicles|scrotum|erection|piss|pissing|urine|feces|groping|horny|seductive|seduction|sultry|sensual|sexy|breasts[_ ]out|panties[_ ]down|loli|shota|child|childlike|underage|toddler|infant|preteen|little[_ ]girl|little[_ ]boy|young[_ ]girl|underboob|breast[_ ]?grab|breast[_ ]?squeeze|ass[_ ]?grab)\b|里番|色情|情色|性交|交媾|做爱|口交|肛交|乳交|自慰|高潮|淫|精液|射精|阴道|阴茎|阴部|阴蒂|阴毛|龟头|肛门|肉棒|肉穴|乳头|乳晕|露乳|露点|全裸|裸体|裸露|裸身|裸上|裸下|脱衣|脱裤|调教|性虐|强奸|轮奸|性侵|乱伦|性行为|性玩具|触手奸|露出癖|无内裤|没穿内裤|不穿内裤|裸胸|裸臀|脱光|性暗示|性感|性奋|骚气|幼女|萝莉|正太|幼儿|小女孩|小男孩|未成年|儿童|春药|情趣|媚药|奶水|催眠.*性|性.*催眠)/i;

export function isGeneralCodexContent(value: string) {
  // Underscores are word characters in JS; normalize them before boundary checks.
  return !excludedContent.test(value.replace(/_/g, " "));
}

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
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

export function parseCodexSource(html: string, capturedAt: string): CodexCatalog {
  const fragment = contentFragment(
    html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ""),
  );
  type SourceEntry = { categoryId: string; title: string; anchor: string; paragraphs: string[] };
  const categories: CodexCatalog["categories"] = [];
  const raw: SourceEntry[] = [];
  let category: CodexCatalog["categories"][number] | undefined;
  let entry: SourceEntry | undefined;
  for (const match of fragment.matchAll(/<h([23])\b([^>]*)>([\s\S]*?)<\/h\1>|<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    if (match[1]) {
      const title = plainText(match[3]);
      const anchorMatch = /\bid=["']([^"']+)["']/i.exec(match[2]);
      if (!title || !anchorMatch) throw new Error("标题或原文锚点缺失，停止导入。");
      const anchor = decodeHtml(anchorMatch[1]);
      if (match[1] === "2") {
        category = { id: stableId("chapter", anchor), title, count: 0 };
        categories.push(category);
      }
      entry = category ? { categoryId: category.id, title, anchor, paragraphs: [] } : undefined;
      if (entry) raw.push(entry);
    } else if (entry) {
      const paragraph = plainText(match[4]);
      if (paragraph) entry.paragraphs.push(paragraph);
    }
  }
  if (!categories.length || !raw.length) throw new Error("原页面没有可识别的标题。");
  const entries: CodexEntry[] = [];
  let omittedCount = 0;
  for (const item of raw) {
    if (!item.paragraphs.length) continue;
    const categoryTitle = categories.find((value) => value.id === item.categoryId)!.title;
    if (!isGeneralCodexContent([categoryTitle, item.title, ...item.paragraphs].join("\n"))) {
      omittedCount++;
      continue;
    }
    const groups: CodexEntry["groups"] = [];
    const notes: string[] = [];
    let label = "";
    for (const paragraph of item.paragraphs) {
      if (/^[\s—\-＝=]+$/.test(paragraph)) continue;
      if (/以下正文/.test(paragraph)) continue;
      if (!/[a-z]/i.test(paragraph) || /^(?:ps\s*\d*\s*[:：]|注[：:]|说明[：:]|NAI[\d.]*时期[：:]?$)/i.test(paragraph)) {
        if (/^NAI[\d.]*时期/i.test(paragraph)) label = paragraph.replace(/[：:]$/, "");
        else notes.push(paragraph);
        continue;
      }
      // Explanation lists use full-width colons. Artist prefixes and numeric
      // weights use ASCII colons and must remain byte-for-byte unchanged.
      if (paragraph.includes("：") && /[\u3400-\u9fff]/.test(paragraph)) {
        for (const line of paragraph.split("\n")) {
          const parts = /^([^：]+)：(.+)$/.exec(line.trim());
          if (parts && !/[\u3400-\u9fff]/.test(parts[1]) && /[a-z]/i.test(parts[1])) {
            groups.push({ label: parts[2].trim(), prompt: parts[1].trim() });
          } else if (line.trim()) notes.push(line.trim());
        }
        continue;
      }
      const number = /^(\d+)[，、]\s*/.exec(paragraph);
      const prompt = number ? paragraph.slice(number[0].length) : paragraph;
      groups.push({
        label: [label, `标签组 ${number?.[1] ?? groups.length + 1}`].filter(Boolean).join(" · "),
        prompt,
      });
    }
    if (!groups.length) continue;
    entries.push({
      id: stableId("entry", item.anchor), categoryId: item.categoryId,
      title: item.title, anchor: item.anchor, groups, notes,
    });
  }
  const counts = new Map<string, number>();
  for (const item of entries) counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1);
  return {
    version: 1,
    categories: categories.filter((item) => counts.has(item.id)).map((item) => ({ ...item, count: counts.get(item.id)! })),
    entries,
    source: {
      url: DIRECTOR_CODEX_URL, title: "所长常规NovalAI个人法典",
      author: "一般所长",
      edition: /(\d{4}[./-]\d{1,2}[./-]\d{1,2})版/.exec(plainText(fragment).slice(0, 2000))?.[1] ?? "未标注",
      capturedAt, importedAt: null, omittedCount,
    },
  };
}
