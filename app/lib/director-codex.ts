export const DIRECTOR_CODEX_URL =
  "https://nai-bot.pages.dev/法典/所长常规novalai个人法典/";

export type CodexGroup = { label: string; prompt: string };
export type CodexEntry = {
  id: string;
  categoryId: string;
  title: string;
  anchor: string;
  groups: CodexGroup[];
  notes: string[];
};
export type CodexCatalog = {
  version: 1;
  categories: { id: string; title: string; count: number }[];
  entries: CodexEntry[];
  source: {
    url: string;
    title: string;
    author: string;
    edition: string;
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

export function isCodexCatalog(value: unknown): value is CodexCatalog {
  if (
    !record(value) || value.version !== 1 ||
    !Array.isArray(value.categories) || value.categories.length > 200 ||
    !Array.isArray(value.entries) || value.entries.length > 10_000 ||
    !record(value.source)
  ) return false;
  const categories = new Map<string, number>();
  const expectedCounts = new Map<string, number>();
  for (const category of value.categories) {
    if (!record(category) || !text(category.id) || !text(category.title) ||
      !count(category.count) || categories.has(category.id)) return false;
    categories.set(category.id, 0);
    expectedCounts.set(category.id, category.count);
  }
  const ids = new Set<string>();
  for (const entry of value.entries) {
    if (
      !record(entry) || !text(entry.id) || ids.has(entry.id) ||
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
  return source.url === DIRECTOR_CODEX_URL && text(source.title) &&
    text(source.author) && text(source.edition) &&
    text(source.capturedAt) && Number.isFinite(Date.parse(source.capturedAt)) &&
    (source.importedAt === null ||
      (text(source.importedAt) && Number.isFinite(Date.parse(source.importedAt)))) &&
    count(source.omittedCount);
}

export function normalizeCodexSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("en").replace(/_/g, " ").replace(/\s+/g, " ").trim();
}

export function createCodexIndex(catalog: CodexCatalog) {
  const categoryNames = new Map(catalog.categories.map((category) => [category.id, category.title]));
  const indexed = catalog.entries.map((entry) => ({
    entry,
    text: normalizeCodexSearch([
      categoryNames.get(entry.categoryId), entry.title,
      ...entry.groups.flatMap((group) => [group.label, group.prompt]),
      ...entry.notes,
    ].join(" ")),
  }));
  return {
    filter(query: string, categoryId = "all") {
      const terms = normalizeCodexSearch(query).split(" ").filter(Boolean);
      return indexed.filter(({ entry, text }) =>
        (categoryId === "all" || entry.categoryId === categoryId) &&
        terms.every((term) => text.includes(term)),
      ).map(({ entry }) => entry);
    },
  };
}

export function codexSourceLink(anchor: string) {
  return `${DIRECTOR_CODEX_URL}#${encodeURIComponent(anchor)}`;
}
