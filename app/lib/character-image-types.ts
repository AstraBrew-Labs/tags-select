export const CHARACTER_IMAGE_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
export const CHARACTER_IMAGE_CACHE_VERSION = 2 as const;
export const CHARACTER_IMAGE_CACHE_KEY = "novelai-tags:character-images:v2";
export const CHARACTER_IMAGE_CACHE_MAX_ENTRIES = 2_000;

export type CharacterImageRecord = {
  cachedAt: number;
  imageUrl: string | null;
};

export type CharacterImageResponse = {
  tag: string;
  imageUrl: string | null;
  cached: boolean;
};

export function normalizeCharacterTag(value: string) {
  return value.trim().replace(/\s+/g, "_").toLowerCase();
}

export function resolveCharacterImageTag(value: string) {
  const tag = normalizeCharacterTag(value);
  // Verified Danbooru names only; never strip ambiguous work qualifiers.
  return tag === "jouga_maya_(gochuumon_wa_usagi_desu_ka?)"
    ? "jouga_maya"
    : tag;
}

export function isCharacterImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      ["danbooru.donmai.us", "cdn.donmai.us"].includes(url.hostname) &&
      /\.(?:jpe?g|png|webp|gif|avif)$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function isFreshCharacterImage(
  record: unknown,
  now = Date.now(),
): record is CharacterImageRecord {
  if (typeof record !== "object" || record === null || Array.isArray(record))
    return false;
  const entry = record as CharacterImageRecord;
  return (
    Number.isFinite(entry.cachedAt) &&
    entry.cachedAt <= now &&
    now < entry.cachedAt + CHARACTER_IMAGE_CACHE_TTL &&
    (entry.imageUrl === null || isCharacterImageUrl(entry.imageUrl))
  );
}

export function isCharacterImageResponse(
  value: unknown,
): value is CharacterImageResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.tag === "string" &&
    (record.imageUrl === null || isCharacterImageUrl(record.imageUrl)) &&
    typeof record.cached === "boolean"
  );
}
