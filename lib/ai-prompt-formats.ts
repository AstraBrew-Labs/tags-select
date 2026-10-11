import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { aiRequestOrigin } from "./ai-document-response";
import { AiSearchError } from "./ai-tag-search";
import { AI_CORS_HEADERS } from "./ai-http";

/** Prompt-format specs mirrored from the upstream Danbooru Tag Searcher
 * `/get_anima_format`, `/get_newbie_format` and `/get_qwen_image_2_1_format`
 * endpoints. They are static reference documents, so they ship with the
 * deployment instead of costing a remote request per lookup. */
export const AI_PROMPT_FORMAT_NAMES = ["anima", "newbie", "qwen_image"] as const;
export type AiPromptFormatName = (typeof AI_PROMPT_FORMAT_NAMES)[number];

/** Qwen-Image-2.1 requires an explicit mode; the other specs have none. */
export const AI_QWEN_IMAGE_MODES = ["T2I", "I2I"] as const;
export type AiQwenImageMode = (typeof AI_QWEN_IMAGE_MODES)[number];

/** Query parameters the format endpoint understands; anything else is rejected. */
export const AI_PROMPT_FORMAT_QUERY_KEYS = ["format", "mode"] as const;

type AiPromptFormatDefinition = {
  name: AiPromptFormatName;
  title: string;
  /** Chinese summary reused by the index response and the AI documents. */
  summary: string;
  /** MCP tool name that returns the same spec. */
  tool: string;
  /** One spec file per format; `qwen_image` has one entry per required mode. */
  files: { mode: AiQwenImageMode | null; file: string }[];
};

export const AI_PROMPT_FORMATS: readonly AiPromptFormatDefinition[] = [
  {
    name: "anima",
    title: "Anima Hybrid Prompt Format Specification",
    summary: "Anima Hybrid 提示词格式规范：Hard Tags 与 Natural Language 双层结构，涵盖构图模式、主体占比、前景限制、光照曝光、色彩角色、标签顺序与数量、权重以及多人物特征分离规则。",
    tool: "get_anima_format",
    files: [{ mode: null, file: "anima.md" }],
  },
  {
    name: "newbie",
    title: "NewBie XML Prompt Format Specification",
    summary: "NewBie XML 提示词格式规范：character_N / general_tags / caption 三段式 XML，涵盖情境因果锁、标签转义、八维补全检查、冲突检查与多人物防混淆规则。",
    tool: "get_newbie_format",
    files: [{ mode: null, file: "newbie.md" }],
  },
  {
    name: "qwen_image",
    title: "Qwen-Image-2.1 Prompt Format Specification",
    summary: "Qwen-Image-2.1 规范；必填 mode：T2I 文生图，I2I 图生图。返回对应的改写目标、输出字段与 JSON 输出格式。",
    tool: "get_qwen_image_format",
    files: [
      { mode: "T2I", file: "qwen-image-t2i.md" },
      { mode: "I2I", file: "qwen-image-i2i.md" },
    ],
  },
];

/** Every spec file is read once per process and reused for later requests. */
const specCache = new Map<string, Promise<string>>();

/** The specs are committed source (not a generated snapshot), so a plain
 * checkout can serve them without running the data build first. */
function loadSpec(file: string) {
  let job = specCache.get(file);
  if (!job) {
    job = readFile(join(process.cwd(), "data", "ai-formats", file), "utf8")
      .then((text) => text.replace(/^\s+/, ""))
      .catch((error) => { specCache.delete(file); throw error; });
    specCache.set(file, job);
  }
  return job;
}

export function isAiPromptFormatName(value: string): value is AiPromptFormatName {
  return (AI_PROMPT_FORMAT_NAMES as readonly string[]).includes(value);
}

export function isAiQwenImageMode(value: string): value is AiQwenImageMode {
  return (AI_QWEN_IMAGE_MODES as readonly string[]).includes(value);
}

/** Read one spec. `mode` is required for and unique to `qwen_image`. */
export async function readAiPromptFormat(format: string, mode?: string | null) {
  if (!isAiPromptFormatName(format)) {
    throw new AiSearchError(`format 须为 ${AI_PROMPT_FORMAT_NAMES.join(" / ")}。`, 400);
  }
  const definition = AI_PROMPT_FORMATS.find((item) => item.name === format)!;
  const needsMode = definition.files.length > 1;
  if (!needsMode) {
    if (mode) throw new AiSearchError(`format=${format} 不接受 mode。`, 400);
  } else if (!mode) {
    throw new AiSearchError(`format=${format} 必填 mode：T2I 文生图，I2I 图生图。`, 400);
  } else if (!isAiQwenImageMode(mode)) {
    throw new AiSearchError(`mode 须为 ${AI_QWEN_IMAGE_MODES.join(" / ")}。`, 400);
  }
  const selected = definition.files.find((item) => item.mode === (needsMode ? mode : null));
  if (!selected) throw new AiSearchError("未知的提示词格式。", 400);
  return {
    format: definition.name,
    mode: needsMode ? (mode as AiQwenImageMode) : null,
    title: definition.title,
    text: await loadSpec(selected.file),
  };
}

/** Discovery index so an AI can list the specs without guessing parameters. */
export function aiPromptFormatIndex(origin: string) {
  return {
    formats: AI_PROMPT_FORMATS.map((item) => {
      const needsMode = item.files.length > 1;
      const query = `format=${item.name}${needsMode ? `&mode=${AI_QWEN_IMAGE_MODES[0]}` : ""}`;
      return {
        format: item.name,
        title: item.title,
        summary: item.summary,
        mode_required: needsMode,
        modes: needsMode ? [...AI_QWEN_IMAGE_MODES] : [],
        url: `${origin}/api/ai/formats?${query}`,
        mcp_tool: item.tool,
      };
    }),
  };
}

const FORMAT_SPEC_CACHE_HEADERS = { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } as const;
const FORMAT_INDEX_CACHE_HEADERS = { "Cache-Control": "public, max-age=300" } as const;

/** GET /api/ai/formats — index without `format`, raw spec text with it. */
export async function handleAiPromptFormat(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some((key) =>
      !(AI_PROMPT_FORMAT_QUERY_KEYS as readonly string[]).includes(key) || params.getAll(key).length !== 1)) {
      throw new AiSearchError("只支持 format 与 mode 参数，且不能重复。", 400);
    }
    const format = params.get("format");
    if (format === null) {
      if (params.has("mode")) throw new AiSearchError("mode 需要与 format 一起使用。", 400);
      return Response.json(aiPromptFormatIndex(aiRequestOrigin(request)), {
        headers: { ...AI_CORS_HEADERS, ...FORMAT_INDEX_CACHE_HEADERS },
      });
    }
    const spec = await readAiPromptFormat(format, params.get("mode"));
    return new Response(spec.text, { headers: {
      ...AI_CORS_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
      "X-Prompt-Format": spec.format,
      ...(spec.mode ? { "X-Prompt-Mode": spec.mode } : {}),
      ...FORMAT_SPEC_CACHE_HEADERS,
    } });
  } catch (error) {
    const status = error instanceof AiSearchError ? error.status : 503;
    return Response.json({
      error: error instanceof AiSearchError ? error.message : "提示词格式规范暂不可用，请稍后重试。",
    }, { status, headers: { ...AI_CORS_HEADERS, "Cache-Control": "no-store" } });
  }
}
