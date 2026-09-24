import { createStore, del, get, set } from "idb-keyval";

import type { Skill } from "../../types/skill";

/**
 * Cold-start cache for the parsed registry, kept in IndexedDB and read
 * inside the worker. The cache only serves "show first, verify later": every
 * session still probes the published stats and re-downloads the index when
 * the advertised run differs from the cached one — a matching run lets the
 * multi-megabyte download be skipped outright.
 */

const KEY = "skills";

/**
 * Bump when the stored Skill shape changes so stale records are dropped.
 *
 * Version 5 flushes records written before the index carried Chinese
 * descriptions: those rows have no `descriptionZh`, and the "unchanged"
 * short-circuit would keep serving them for up to a day with no translation.
 * Version 4 flushes records written before the dataset consolidated: those
 * carry a second source's stamps (`profilesAt`/`profilesTag`) and skills whose
 * `profile.domain` is a single string, which the new grouping and badge code
 * cannot read.
 * Version 3 flushed records written by builds whose repos.jsonl stars join
 * could fail silently: those hold 0 stars yet carry a current run stamp, so
 * the "unchanged" short-circuit would keep serving them for up to a day.
 */
const SCHEMA_VERSION = 5;

/**
 * The same database and object store this module used before it delegated to
 * `idb-keyval` (which opens at version 1 and creates the store when missing),
 * so a cache written by an earlier build is still read here.
 */
const store = createStore("skill-one-registry", "index");

/** Identity of the published snapshot a record was built from. */
export interface CacheIdentity {
  /** `dist-<date>[-N]` tag the index was fetched at; absent when unpinned. */
  tag?: string;
  /** The producing run's `finishedAt`, the snapshot's freshness identity. */
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

/** The three key/value operations the cache needs. */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

const keyVal: KeyValueStore = {
  get: (key) => get(key, store),
  set: (key, value) => set(key, value, store),
  del: (key) => del(key, store),
};

/**
 * Registry cache over IndexedDB. Every method degrades to a no-op (or null)
 * when the database cannot be reached — private-mode WebViews must keep the
 * app working uncached, not crash the worker. `store` is injectable so tests
 * exercise the record rules without an IndexedDB implementation.
 */
export function createRegistryCache(kv: KeyValueStore = keyVal) {
  return {
    /** Cached dataset, or null on miss, version mismatch, or DB failure. */
    async load(): Promise<CachedIndex | null> {
      let record: CacheRecord | undefined;
      try {
        record = await kv.get<CacheRecord>(KEY);
      } catch {
        return null;
      }
      if (!record || record.schemaVersion !== SCHEMA_VERSION) return null;
      const { skills, tag, generatedAt, fetchedAt } = record;
      return { skills, tag, generatedAt, fetchedAt };
    },

    /** Persist the parsed registry with its snapshot identity (overwrites). */
    async save(skills: Skill[], identity: CacheIdentity = {}): Promise<void> {
      const record: CacheRecord = {
        schemaVersion: SCHEMA_VERSION,
        fetchedAt: Date.now(),
        tag: identity.tag,
        generatedAt: identity.generatedAt,
        skills,
      };
      try {
        await kv.set(KEY, record);
      } catch {
        // Caching is an optimization; losing the write costs a re-download.
      }
    },

    /** Drop the cache (a source switch invalidates the stored data). */
    async clear(): Promise<void> {
      try {
        await kv.del(KEY);
      } catch {
        // Nothing stored means nothing to drop.
      }
    },
  };
}

export type RegistryCache = ReturnType<typeof createRegistryCache>;
