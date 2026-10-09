export type WeightSyntax = "brackets" | "parentheses";
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
  const [open, close] =
    level > 0 ? (syntax === "brackets" ? ["{", "}"] : ["(", ")"]) : ["[", "]"];
  return open.repeat(Math.abs(level)) + name + close.repeat(Math.abs(level));
}

/** Keep source text/order intact; the first occurrence of an English value wins. */
export function formatWeightedPrompt(
  entries: readonly { name: string; step: number }[],
  syntax: WeightSyntax = "brackets",
) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of entries) {
    if (seen.has(entry.name)) continue;
    seen.add(entry.name);
    result.push(formatWeightedTag(entry.name, entry.step, syntax));
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
