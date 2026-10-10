export const ADULT_CODEX_AUTHOR = "一般所长";

export const ADULT_CODEX_VOLUMES = [
  {
    id: "upper",
    label: "上卷",
    title: "所长色色NovalAI个人法典(上)",
    url: "https://nai-bot.pages.dev/法典/所长色色novalai个人法典上/",
  },
  {
    id: "lower",
    label: "下卷",
    title: "所长色色NovalAI个人法典(下)",
    url: "https://nai-bot.pages.dev/法典/所长色色novalai个人法典下/",
  },
] as const;

export type AdultCodexVolume = (typeof ADULT_CODEX_VOLUMES)[number];
export type AdultCodexGroup = { label: string; prompt: string };
export type AdultCodexEntry = {
  id: string;
  volumeId: AdultCodexVolume["id"];
  categoryId: string;
  title: string;
  anchor: string;
  groups: AdultCodexGroup[];
  notes: string[];
};
export type AdultCodexCategory = {
  id: string;
  volumeId: AdultCodexVolume["id"];
  title: string;
  count: number;
};
export type AdultCodexCatalog = {
  version: 1;
  volumes: AdultCodexVolume[];
  categories: AdultCodexCategory[];
  entries: AdultCodexEntry[];
  source: {
    author: string;
    capturedAt: string;
    importedAt: string | null;
    omittedCount: number;
  };
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function count(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isAdultCodexCatalog(value: unknown): value is AdultCodexCatalog {
  if (
    !record(value) || value.version !== 1 ||
    !Array.isArray(value.volumes) || value.volumes.length !== ADULT_CODEX_VOLUMES.length ||
    !Array.isArray(value.categories) || value.categories.length > 200 ||
    !Array.isArray(value.entries) || value.entries.length > 12_000 ||
    !record(value.source)
  ) return false;

  const volumeIds = new Set<string>(ADULT_CODEX_VOLUMES.map((volume) => volume.id));
  const volumes = new Set<string>();
  for (const volume of value.volumes) {
    if (
      !record(volume) || !text(volume.id) || volumes.has(volume.id) ||
      !volumeIds.has(volume.id) || !text(volume.label) ||
      !text(volume.title) || !text(volume.url) ||
      !/^https:\/\//i.test(volume.url)
    ) return false;
    volumes.add(volume.id);
  }

  const categories = new Map<string, number>();
  const expectedCounts = new Map<string, number>();
  for (const category of value.categories) {
    if (
      !record(category) || !text(category.id) || categories.has(category.id) ||
      !text(category.volumeId) || !volumeIds.has(category.volumeId) ||
      !text(category.title) || !count(category.count)
    ) return false;
    categories.set(category.id, 0);
    expectedCounts.set(category.id, category.count);
  }

  const ids = new Set<string>();
  for (const entry of value.entries) {
    if (
      !record(entry) || !text(entry.id) || ids.has(entry.id) ||
      !text(entry.volumeId) || !volumeIds.has(entry.volumeId) ||
      !text(entry.categoryId) || !categories.has(entry.categoryId) ||
      !text(entry.title) || !text(entry.anchor) ||
      !Array.isArray(entry.groups) || !entry.groups.length ||
      !entry.groups.every((group) => record(group) && text(group.label) && text(group.prompt)) ||
      !Array.isArray(entry.notes) || !entry.notes.every(text)
    ) return false;
    ids.add(entry.id);
    categories.set(entry.categoryId, categories.get(entry.categoryId)! + 1);
  }
  for (const [id, actual] of categories) {
    if (actual !== expectedCounts.get(id)) return false;
  }

  const source = value.source;
  return (
    source.author === ADULT_CODEX_AUTHOR &&
    text(source.capturedAt) &&
    Number.isFinite(Date.parse(source.capturedAt)) &&
    (source.importedAt === null ||
      (text(source.importedAt) && Number.isFinite(Date.parse(source.importedAt)))) &&
    count(source.omittedCount)
  );
}

export function normalizeAdultCodexSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export function createAdultCodexIndex(catalog: AdultCodexCatalog) {
  const categoryNames = new Map(catalog.categories.map((category) => [category.id, category.title]));
  const volumeNames = new Map(catalog.volumes.map((volume) => [volume.id, volume.label]));
  const indexed = catalog.entries.map((entry) => ({
    entry,
    text: normalizeAdultCodexSearch([
      volumeNames.get(entry.volumeId), categoryNames.get(entry.categoryId), entry.title,
      ...entry.groups.flatMap((group) => [group.label, group.prompt]),
      ...entry.notes,
    ].join(" ")),
  }));
  return {
    filter(query: string, categoryId = "all", volumeId = "all") {
      const terms = normalizeAdultCodexSearch(query).split(" ").filter(Boolean);
      return indexed.filter(({ entry, text }) =>
        (categoryId === "all" || entry.categoryId === categoryId) &&
        (volumeId === "all" || entry.volumeId === volumeId) &&
        terms.every((term) => text.includes(term)),
      ).map(({ entry }) => entry);
    },
  };
}

export function adultCodexSourceLink(volumeId: string, anchor: string) {
  const volume = ADULT_CODEX_VOLUMES.find((item) => item.id === volumeId);
  return volume ? `${volume.url}#${encodeURIComponent(anchor)}` : "#";
}
