export type WeightSyntax = "brackets" | "parentheses" | "novelai";
export const WEIGHT_SYNTAX_LABELS: Record<WeightSyntax, string> = {
  brackets: "{ }",
  parentheses: "( )",
  novelai: "NovelAI :: ::",
};
const WEIGHT_SYNTAX_ORDER: readonly WeightSyntax[] = ["brackets", "parentheses", "novelai"];
export function nextWeightSyntax(syntax: WeightSyntax): WeightSyntax {
  return WEIGHT_SYNTAX_ORDER[(WEIGHT_SYNTAX_ORDER.indexOf(syntax) + 1) % WEIGHT_SYNTAX_ORDER.length];
}
export type PromptWeightOptions = {
  weights?: Readonly<Record<string, number>>;
  syntax?: WeightSyntax;
};
export const MIN_WEIGHT_STEP = -20;
export const MAX_WEIGHT_STEP = 20;

export function clampWeightStep(step: number) {
  return Number.isFinite(step)
    ? Math.min(MAX_WEIGHT_STEP, Math.max(MIN_WEIGHT_STEP, Math.trunc(step)))
    : 0;
}
export function formatWeightedTag(
  name: string,
  step = 0,
  syntax: WeightSyntax = "brackets",
) {
  const level = clampWeightStep(step);
  if (level === 0) return name;
  if (syntax === "novelai") {
    const weight = Number((1.05 ** level).toFixed(3));
    return `${weight}::${name}::`;
  }
  const [open, close] =
    level > 0 ? (syntax === "brackets" ? ["{", "}"] : ["(", ")"]) : ["[", "]"];
  return open.repeat(Math.abs(level)) + name + close.repeat(Math.abs(level));
}

export function normalizePromptTagName(name: string) {
  return name.split(",").map((tag) => tag.trim().replace(/\s+/g, "_")).join(", ");
}

/** Normalize output names only; preserve order and the first occurrence's weight. */
export function formatWeightedPrompt(
  entries: readonly { name: string; step: number }[],
  syntax: WeightSyntax = "brackets",
) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    const name = normalizePromptTagName(entry.name);
    if (seen.has(name)) continue;
    seen.add(name);
    result.push(formatWeightedTag(name, entry.step, syntax));
  }
  return result.join(", ");
}

export function adjustPromptWeights(
  ids: readonly string[],
  weights: Readonly<Record<string, number>>,
  delta: number,
) {
  return Object.fromEntries(
    ids.map((id) => [id, clampWeightStep((weights[id] ?? 0) + delta)]),
  );
}
