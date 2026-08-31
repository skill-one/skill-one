import { describe, it, expect, vi } from "vitest";

import { createRegistryCache } from "./cache";
import type { Skill } from "../../types/skill";

const skills: Skill[] = [
  { name: "a", repo: "o/a", description: "", stars: 1, downloads: 2 },
  { name: "b", repo: "o/b", description: "", stars: 3, downloads: 4 },
];

/** A request object that completes on the next microtask, like real IDB. */
function makeRequest(result?: unknown, fail = false): IDBRequest {
  const request = {
    result,
    onsuccess: null as null | (() => void),
    onerror: null as null | (() => void),
  };
  queueMicrotask(() => (fail ? request.onerror?.() : request.onsuccess?.()));
  return request as unknown as IDBRequest;
}

/**
 * Minimal in-memory stand-in for the IndexedDB surface the cache uses:
 * one object store keyed by a single string. `failGets` turns every read
 * into a failing request.
 */
function fakeDb(failGets = false) {
  const store = new Map<string, unknown>();
  const db = {
    close: vi.fn(),
    transaction: () => ({
      objectStore: () => ({
        get: (key: string) => makeRequest(store.get(key), failGets),
        put: (value: unknown, key: string) => {
          store.set(key, value);
          return makeRequest();
        },
        delete: (key: string) => {
          store.delete(key);
          return makeRequest();
        },
      }),
    }),
  };
  return { db, store };
}

function openDbOf(db: object) {
  return () => Promise.resolve(db as unknown as IDBDatabase);
}

describe("createRegistryCache", () => {
  it("round-trips the parsed registry through save/load", async () => {
    const { db } = fakeDb();
    const cache = createRegistryCache(openDbOf(db));

    await cache.save(skills);
    await expect(cache.load()).resolves.toEqual(skills);
  });

  it("returns null on an empty store", async () => {
    const { db } = fakeDb();
    const cache = createRegistryCache(openDbOf(db));
    await expect(cache.load()).resolves.toBeNull();
  });

  it("drops records written by an older schema version", async () => {
    const { db, store } = fakeDb();
    const cache = createRegistryCache(openDbOf(db));
    await cache.save(skills);

    // Age the stored record into a previous schema version.
    const record = [...store.values()][0] as { schemaVersion: number };
    record.schemaVersion = -1;
    await expect(cache.load()).resolves.toBeNull();
  });

  it("clear() removes the stored record", async () => {
    const { db } = fakeDb();
    const cache = createRegistryCache(openDbOf(db));
    await cache.save(skills);
    await cache.clear();
    await expect(cache.load()).resolves.toBeNull();
  });

  it("degrades to null / no-ops when the database cannot open", async () => {
    const cache = createRegistryCache(() =>
      Promise.reject(new Error("blocked")),
    );
    await expect(cache.load()).resolves.toBeNull();
    await expect(cache.save(skills)).resolves.toBeUndefined();
    await expect(cache.clear()).resolves.toBeUndefined();
  });

  it("degrades to null when a read request fails", async () => {
    const { db } = fakeDb(true);
    const cache = createRegistryCache(openDbOf(db));
    await expect(cache.load()).resolves.toBeNull();
  });
});
