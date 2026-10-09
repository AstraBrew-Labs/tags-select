import type { NovelTag } from "./tag-catalog";

export type PromptToken = { input: string; term: string; normalized: string };
export type PromptMatch = { tag: NovelTag; kind: "exact" | "component" };
export type PromptLookupItem = PromptToken & {
  occurrences: number;
  matches: PromptMatch[];
};
export type PromptLookupResult = {
  items: PromptLookupItem[];
  total: number;
  matched: number;
  unmatched: number;
  duplicates: number;
};

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/_/g, " ").replace(/\s+/g, " ");
}
const closes: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
function isWrapped(value: string) {
  const close = closes[value[0]];
  if (!close || !value.endsWith(close)) return false;
  const stack: string[] = [];
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (closes[char]) stack.push(closes[char]);
    else if (char === stack.at(-1)) {
      stack.pop();
      if (stack.length === 0 && index !== value.length - 1) return false;
    }
  }
  return stack.length === 0;
}
function splitTopLevel(value: string) {
  const out: string[] = [];
  const stack: string[] = [];
  let start = 0;
  let numericWeight = false;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (char === ":" && value[index + 1] === ":" && stack.length === 0) {
      if (numericWeight) numericWeight = false;
      else if (
        /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.slice(start, index).trim())
      )
        numericWeight = true;
      index++;
      continue;
    }
    if (closes[char]) stack.push(closes[char]);
    else if (char === stack.at(-1)) stack.pop();
    else if (
      (char === "," || char === "，" || char === "\n" || char === "\r") &&
      stack.length === 0 &&
      !numericWeight
    ) {
      out.push(value.slice(start, index));
      start = index + 1;
    }
  }
  out.push(value.slice(start));
  return out.map((part) => part.trim()).filter(Boolean);
}
function unwrap(value: string) {
  // Tags with internal parentheses, artist: prefixes, and numeric names stay intact.
  let term = value.trim();
  while (true) {
    const numeric = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*::([\s\S]*)::$/.exec(term);
    if (numeric) {
      term = numeric[1].trim();
      continue;
    }
    if (!isWrapped(term)) break;
    const opening = term[0];
    term = term.slice(1, -1).trim();
    if (opening === "(")
      term = term.replace(/:\s*[+-]?(?:\d+(?:\.\d+)?|\.\d+)\s*$/, "").trim();
  }
  return term;
}

/** Split emphasis groups, not commas inside character/artist-name parentheses. */
export function parsePromptTokens(value: string): PromptToken[] {
  const out: PromptToken[] = [];
  function collect(part: string) {
    const term = unwrap(part);
    const chunks = splitTopLevel(term);
    if (chunks.length > 1) {
      for (const chunk of chunks) collect(chunk);
      return;
    }
    const normalized = normalize(term);
    if (normalized) out.push({ input: part.trim(), term, normalized });
  }
  for (const chunk of splitTopLevel(value)) collect(chunk);
  return out;
}

export function createPromptLookup(tags: readonly NovelTag[]) {
  const exact = new Map<string, NovelTag[]>();
  const components = new Map<string, NovelTag[]>();
  function index(map: Map<string, NovelTag[]>, name: string, tag: NovelTag) {
    const key = normalize(name);
    if (!key) return;
    const matches = map.get(key) ?? [];
    if (!matches.some((match) => match.id === tag.id)) matches.push(tag);
    map.set(key, matches);
  }
  for (const tag of tags) {
    index(exact, tag.name, tag);
    index(exact, tag.translation, tag);
    for (const alias of tag.aliases) index(exact, alias, tag);
    const parts = parsePromptTokens(tag.name);
    if (parts.length > 1)
      for (const part of parts) index(components, part.term, tag);
  }
  return function lookupPrompt(value: string): PromptLookupResult {
    const tokens = parsePromptTokens(value);
    const byTerm = new Map<string, PromptLookupItem>();
    for (const token of tokens) {
      const current = byTerm.get(token.normalized);
      if (current) {
        current.occurrences++;
        continue;
      }
      // An exact ordinary parenthesized tag wins before emphasis normalization.
      const direct =
        exact.get(normalize(token.input)) ?? exact.get(token.normalized);
      const partial = direct ? undefined : components.get(token.normalized);
      byTerm.set(token.normalized, {
        ...token,
        occurrences: 1,
        matches: (direct ?? partial ?? []).map((tag) => ({
          tag,
          kind: direct ? "exact" : "component",
        })),
      });
    }
    const items = [...byTerm.values()];
    const matched = items.filter((item) => item.matches.length > 0).length;
    return {
      items,
      total: tokens.length,
      matched,
      unmatched: items.length - matched,
      duplicates: tokens.length - items.length,
    };
  };
}
