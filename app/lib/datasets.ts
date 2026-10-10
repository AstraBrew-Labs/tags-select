import { isCatalogResponse } from "./catalog-cache";
import { isCodexCatalog } from "./director-codex";
import { isAdultCodexCatalog } from "./adult-codex";
import { createDatasetLoader } from "./dataset-loader";
import { datasetStorage } from "./dataset-storage";

async function readJson(url: string, remote: boolean) {
  const response = await fetch(url, {
    cache: remote ? "no-cache" : "default",
    signal: AbortSignal.timeout(remote ? 15_000 : 10_000),
  });
  if (!response.ok) throw new Error("数据加载失败，请稍后重试。");
  // Do not stamp server fallback snapshots as fresh database data for a week.
  if (remote && response.headers.get("X-Catalog-Source") === "local") {
    throw new Error("数据库正在后台刷新，继续使用本地数据。");
  }
  return response.json() as Promise<unknown>;
}
function loader<T>(key: string, validate: (value: unknown) => value is T) {
  return createDatasetLoader({
    key, validate, storage: datasetStorage,
    loadLocal: () => readJson(`/data/${key}.json`, false),
    fetchRemote: () => readJson(`/api/${key}`, true),
  });
}
export const tagDataset = loader("catalog", isCatalogResponse);
export const codexDataset = loader("codex", isCodexCatalog);
export const adultDataset = loader("adult-codex", isAdultCodexCatalog);
export const datasets = [tagDataset, codexDataset, adultDataset];
