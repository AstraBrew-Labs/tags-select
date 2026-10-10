import { describe, expect, test } from "bun:test";
import { createProjectionCache, PROJECTION_TTL, PROJECTION_RETRY_DELAY } from "./projection-cache";

const local = new Uint8Array([1]), database = new Uint8Array([2]);
describe("server projection cache", () => {
  test("slow cold reads return a local fallback then switch to the database cache", async () => {
    let resolve!: (value: Uint8Array) => void, reads = 0;
    const query = new Promise<Uint8Array>((done) => { resolve = done; });
    const cache = createProjectionCache({
      waitMillis: 1, readLocal: async () => local,
      readDatabase: () => { reads++; return query; },
    });
    const [first, second] = await Promise.all([cache.read(), cache.read()]);
    expect(first.projection.source).toBe("local");
    expect(second.projection.gzip).toEqual(local);
    expect(reads).toBe(1);
    resolve(database);
    await first.background;
    expect((await cache.read()).projection).toEqual({ source: "database", gzip: database });
    expect(reads).toBe(1);
  });
  test("warm reads avoid queries and stale data stays visible while revalidating", async () => {
    let time = 1000, reads = 0;
    const cache = createProjectionCache({
      now: () => time, readLocal: async () => local,
      readDatabase: async () => { reads++; return database; },
    });
    expect((await cache.read()).projection.source).toBe("database");
    await cache.read();
    expect(reads).toBe(1);
    time += PROJECTION_TTL;
    const stale = await cache.read();
    expect(stale.projection.gzip).toEqual(database);
    await stale.background;
    expect(reads).toBe(2);
  });
  test("database failures preserve local data and back off repeated queries", async () => {
    let time = 1000, reads = 0;
    const cache = createProjectionCache({
      now: () => time, readLocal: async () => local,
      readDatabase: async () => { reads++; throw new Error("offline"); },
    });
    expect((await cache.read()).projection.source).toBe("local");
    await cache.read();
    expect(reads).toBe(1);
    time += PROJECTION_RETRY_DELAY;
    const result = await cache.read();
    await result.background;
    expect(reads).toBe(2);
    expect(result.projection.gzip).toEqual(local);
  });
  test("both sources failing reports failure but does not poison local retries", async () => {
    let attempts = 0;
    const cache = createProjectionCache({
      readDatabase: async () => { throw new Error("offline"); },
      readLocal: async () => { if (!attempts++) throw new Error("missing"); return local; },
    });
    await expect(cache.read()).rejects.toThrow("missing");
    expect((await cache.read()).projection.source).toBe("local");
  });
});
