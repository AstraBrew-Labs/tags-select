export type DatasetCacheEntry<T> = { version: 1; cachedAt: number; data: T };
export interface DatasetStorage {
  read(key: string): Promise<unknown>;
  write<T>(key: string, entry: DatasetCacheEntry<T>): Promise<void>;
}

let database: Promise<IDBDatabase> | null = null;
function openDatabase() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("novelai-tags:datasets", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("catalogs");
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = null; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Dataset cache is blocked"));
    }).catch((error) => { database = null; throw error; });
  }
  return database;
}

// Async structured storage avoids serializing multi-megabyte JSON on the main thread.
export const datasetStorage: DatasetStorage = {
  async read(key) {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("catalogs", "readonly");
      const request = transaction.objectStore("catalogs").get(key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },
  async write(key, entry) {
    const db = await openDatabase();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("catalogs", "readwrite");
      transaction.objectStore("catalogs").put(entry, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  },
};
