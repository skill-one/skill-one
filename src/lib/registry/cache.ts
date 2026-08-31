import type { Skill } from "../../types/skill";

/**
 * Cold-start cache for the parsed registry, kept in IndexedDB and read
 * inside the worker. The cache only serves "show first, verify later": every
 * session still re-downloads the index in the background and overwrites the
 * record when the fresh stream completes.
 */

const DB_NAME = "skillone-registry";
const DB_VERSION = 1;
const STORE = "index";
const KEY = "skills";

/** Bump when the stored Skill shape changes so stale records are dropped. */
const SCHEMA_VERSION = 1;

/** A single cached record. */
interface CacheRecord {
  schemaVersion: number;
  fetchedAt: number;
  skills: Skill[];
}

/** Minimal `IDBOpenDBRequest`-like factory, injectable for tests. */
export type OpenDb = () => Promise<IDBDatabase>;

function defaultOpenDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Registry cache backed by IndexedDB. Every method degrades to a no-op (or
 * null) when the database cannot be opened — private-mode WebViews must keep
 * the app working uncached, not crash the worker.
 */
export function createRegistryCache(openDb: OpenDb = defaultOpenDb) {
  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T | null> {
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch {
      return null;
    }
    try {
      const tx = db.transaction(STORE, mode);
      return await run(tx.objectStore(STORE));
    } catch {
      return null;
    } finally {
      db.close();
    }
  }

  return {
    /** Cached skills, or null on miss, version mismatch, or DB failure. */
    async load(): Promise<Skill[] | null> {
      const record = await withStore("readonly", (store) =>
        requestToPromise(store.get(KEY) as IDBRequest<CacheRecord | undefined>),
      );
      if (!record || record.schemaVersion !== SCHEMA_VERSION) return null;
      return record.skills;
    },

    /** Persist the parsed registry (overwrites the single record). */
    async save(skills: Skill[]): Promise<void> {
      const record: CacheRecord = {
        schemaVersion: SCHEMA_VERSION,
        fetchedAt: Date.now(),
        skills,
      };
      await withStore("readwrite", (store) =>
        requestToPromise(store.put(record, KEY)),
      );
    },

    /** Drop the cache (a source switch invalidates the stored data). */
    async clear(): Promise<void> {
      await withStore("readwrite", (store) =>
        requestToPromise(store.delete(KEY)),
      );
    },
  };
}

export type RegistryCache = ReturnType<typeof createRegistryCache>;
