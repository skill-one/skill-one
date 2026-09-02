import type { Skill } from "../../types/skill";

/**
 * Cold-start cache for the parsed registry, kept in IndexedDB and read
 * inside the worker. The cache only serves "show first, verify later": every
 * session still probes the published metadata and re-downloads the index when
 * the advertised commit differs from the cached one — a matching commit lets
 * the multi-megabyte download be skipped outright.
 */

const DB_NAME = "skill-one-registry";
const DB_VERSION = 1;
const STORE = "index";
const KEY = "skills";

/** Bump when the stored Skill shape changes so stale records are dropped. */
const SCHEMA_VERSION = 1;

/** Identity of the published snapshot a record was built from. */
export interface CacheIdentity {
  /** `distCommit` the index was fetched at; absent for pre-pinning records. */
  commit?: string;
  /** Upstream `formatVersion` of those records. */
  formatVersion?: number;
  /** Upstream `generatedAt` of that snapshot (display only; never compared). */
  generatedAt?: string;
}

/** A single cached record. */
interface CacheRecord extends CacheIdentity {
  schemaVersion: number;
  fetchedAt: number;
  skills: Skill[];
}

/** The cached dataset plus the identity it was downloaded from. */
export interface CachedIndex extends CacheIdentity {
  skills: Skill[];
  /** When the record was written, in ms since the epoch. */
  fetchedAt: number;
}

/** Minimal `IDBOpenDBRequest`-like factory, injectable for tests. */
type OpenDb = () => Promise<IDBDatabase>;

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
    /** Cached dataset, or null on miss, version mismatch, or DB failure. */
    async load(): Promise<CachedIndex | null> {
      const record = await withStore("readonly", (store) =>
        requestToPromise(store.get(KEY) as IDBRequest<CacheRecord | undefined>),
      );
      if (!record || record.schemaVersion !== SCHEMA_VERSION) return null;
      const { skills, commit, formatVersion, generatedAt, fetchedAt } = record;
      return { skills, commit, formatVersion, generatedAt, fetchedAt };
    },

    /** Persist the parsed registry with its snapshot identity (overwrites). */
    async save(skills: Skill[], identity: CacheIdentity = {}): Promise<void> {
      const record: CacheRecord = {
        schemaVersion: SCHEMA_VERSION,
        fetchedAt: Date.now(),
        commit: identity.commit,
        formatVersion: identity.formatVersion,
        generatedAt: identity.generatedAt,
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
