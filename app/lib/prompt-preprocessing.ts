import { parsePromptTokens } from "./prompt-lookup";

export const PROMPT_SEARCH_MAX_LENGTH = 10_000;
export const PROMPT_SEARCH_BATCH_LIMIT = 12;

/** Remove emphasis, not punctuation belonging to an artist/character tag. */
export function preprocessPromptQuery(value: string) {
  const seen = new Set<string>();
  return parsePromptTokens(value)
    .filter((token) => {
      if (seen.has(token.normalized)) return false;
      seen.add(token.normalized);
      return true;
    })
    .map((token) => token.term)
    .join(", ");
}

/** Split only at tag boundaries. Never silently truncate a pasted prompt. */
export function preparePromptSearch(value: string, maxBatchLength = 300) {
  if (value.length > PROMPT_SEARCH_MAX_LENGTH)
    throw new Error(`提示词最多支持 ${PROMPT_SEARCH_MAX_LENGTH} 个字符，请分段搜索。`);
  const query = preprocessPromptQuery(value);
  if (!query) throw new Error("去除加减权符号后没有有效的标签，请输入标签或描述。");
  if (query.length <= maxBatchLength) return { query, queries: [query] };
  const tokens = parsePromptTokens(query);
  const queries: string[] = [];
  let current = "";
  for (const { term } of tokens) {
    if (term.length > maxBatchLength)
      throw new Error(`单个标签或连续描述不能超过 ${maxBatchLength} 个字符，请使用逗号分隔标签。`);
    const next = current ? `${current}, ${term}` : term;
    if (next.length > maxBatchLength) {
      queries.push(current);
      current = term;
    } else current = next;
  }
  if (current) queries.push(current);
  if (queries.length > PROMPT_SEARCH_BATCH_LIMIT)
    throw new Error(`提示词过长，最多支持 ${PROMPT_SEARCH_BATCH_LIMIT} 批标签，请分段搜索。`);
  return { query, queries };
}
