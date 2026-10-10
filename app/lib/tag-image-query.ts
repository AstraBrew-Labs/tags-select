import { resolveCharacterImageTag } from "./character-image-types";
import { parsePromptTokens } from "./prompt-lookup";

/** A combination uses its first tag, leaving room for the server's rating filter. */
export function resolveTagImageQuery(value: string) {
  if (value.length > 10_000 || /[\u0000-\u001f\u007f]/.test(value)) return "";
  const first = parsePromptTokens(value)[0]?.term ?? "";
  const tag = resolveCharacterImageTag(first.replace(/^artist:\s*/i, ""));
  return tag.length <= 200 && !/[,:*]/.test(tag) && !/^[-~]/.test(tag)
    ? tag
    : "";
}
