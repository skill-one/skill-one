import { getCdnBase, setIndexTag } from "../cdn-config";
import type {
  FeaturedData,
  GroupsData,
  GroupsRequest,
  IndexInfo,
  RankingData,
  RankingRequest,
  RegistryWorkerMessage,
  RevalidateResult,
  SearchData,
} from "./protocol";
import type { SkillRef } from "../../data/featured-content";
import type { Skill } from "../../types/skill";

/**
 * Main-thread proxy of the registry worker: a lazily-spawned singleton that
 * speaks request/response RPC plus push events. The main thread only ever
 * holds page-sized results and the progress count — never the registry.
 */

/** Observable state mirrored from the worker's progress events. */
export interface RegistrySnapshot {
  /** Skills parsed so far (monotonic while streaming). */
  count: number;
  /** The full index has arrived (but the search index may still build). */
  complete: boolean;
  /** The search index is currently being built. */
  indexing: boolean;
  /** complete AND the search index is ready. */
  ready: boolean;
  /**
   * Bumped every time a full dataset lands (cold-start cache, fresh
   * download, revalidation) — consumers invalidate cached pages on change.
   */
  epoch: number;
  /** Last download failure message; null while healthy. */
  error: string | null;
  /** Identity of the published snapshot being served; null until one is. */
  index: IndexInfo | null;
}

const INITIAL_SNAPSHOT: RegistrySnapshot = {
  count: 0,
  complete: false,
  indexing: false,
  ready: false,
  epoch: 0,
  error: null,
  index: null,
};

let worker: Worker | null = null;
let inited = false;
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (data: unknown) => void; reject: (err: Error) => void }
>();
let snapshot = INITIAL_SNAPSHOT;
const subscribers = new Set<() => void>();

function emit() {
  for (const listener of subscribers) listener();
}

function onMessage(message: RegistryWorkerMessage) {
  if (message.type === "result") {
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    if (message.ok) entry.resolve(message.data);
    else entry.reject(new Error(message.error));
  } else if (message.type === "progress") {
    snapshot = {
      ...snapshot,
      count: message.count,
      complete: message.complete,
      indexing: message.indexing,
    };
    emit();
  } else if (message.type === "ready") {
    snapshot = {
      ...snapshot,
      ready: true,
      indexing: false,
      epoch: snapshot.epoch + 1,
    };
    emit();
  } else if (message.type === "index") {
    // Record the served snapshot tag: it pins SKILL.md detail fetches — and
    // the Settings read-out — to the same snapshot the served data was built
    // from. A null info (a failed download with nothing served) keeps the
    // last good tag rather than un-pinning known-good data.
    if (message.info?.tag) setIndexTag(message.info.tag);
    snapshot = { ...snapshot, index: message.info };
    emit();
  } else if (message.type === "error") {
    snapshot = { ...snapshot, error: message.message };
    emit();
  }
}

function ensureWorker(): Worker {
  worker ??= new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (event: MessageEvent<RegistryWorkerMessage>) =>
    onMessage(event.data);
  return worker;
}

function ensureInit() {
  if (inited) return;
  inited = true;
  ensureWorker().postMessage({
    type: "init",
    payload: { cdnBase: getCdnBase() },
  });
}

function request(
  type:
    | "searchSkills"
    | "getGroups"
    | "getFeatured"
    | "getRanking"
    | "lookupSkills"
    | "revalidate",
  payload?: unknown,
): Promise<unknown> {
  ensureInit();
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ type, id, payload });
  });
}

/** Spawn the worker and start the download at app boot. */
export function initRegistry() {
  ensureInit();
}

/** Test hook: tear the singleton down between tests. */
export function resetRegistryClient() {
  worker?.terminate();
  worker = null;
  inited = false;
  for (const entry of pending.values()) entry.reject(new Error("reset"));
  pending.clear();
  snapshot = INITIAL_SNAPSHOT;
  subscribers.clear();
}

/**
 * A name search over the worker's search index: matched skills in relevance
 * order, capped. Answers empty until that index exists (see
 * `lib/search-index`), which the main thread already waits for via `ready`.
 */
export function searchSkills(query: string): Promise<SearchData> {
  return request("searchSkills", { query }) as Promise<SearchData>;
}

/**
 * The explore list grouped by the requested mode, whole (no paging — the page
 * folds groups instead). Call once data is streaming; the answer grows with
 * the loaded prefix like a browse page does.
 */
export function getGroups(request_: GroupsRequest): Promise<GroupsData> {
  return request("getGroups", request_) as Promise<GroupsData>;
}

/** Featured payload; call only once `ready` (see useRegistryStats). */
export function getFeatured(): Promise<FeaturedData> {
  return request("getFeatured") as Promise<FeaturedData>;
}

/** One leaderboard; call only once `ready` (see useRegistryStats). */
export function getRanking(request_: RankingRequest): Promise<RankingData> {
  return request("getRanking", request_) as Promise<RankingData>;
}

/** Registry metadata per ref, in ref order (null on miss). */
export function lookupSkills(refs: SkillRef[]): Promise<{
  entries: Array<Skill | null>;
}> {
  return request("lookupSkills", { refs }) as Promise<{
    entries: Array<Skill | null>;
  }>;
}

/**
 * Cheap freshness check: probe the published snapshots and pull in only what
 * actually moved. The served data keeps rendering throughout — nothing is
 * blanked, and an unreachable probe downloads nothing at all. Resolves with
 * what the check found.
 */
export function revalidateRegistry(): Promise<RevalidateResult> {
  return request("revalidate") as Promise<RevalidateResult>;
}

/**
 * Re-download the index (source switch or user retry). Data already being
 * served keeps rendering until the fresh stream completes.
 */
export function reloadRegistry() {
  snapshot = { ...snapshot, error: null };
  emit();
  ensureInit();
  worker!.postMessage({ type: "reload", payload: { cdnBase: getCdnBase() } });
}

/** Current progress snapshot (stable reference until the next event). */
export function getRegistrySnapshot(): RegistrySnapshot {
  return snapshot;
}

/** Subscribe to snapshot changes; returns an unsubscribe function. */
export function subscribeRegistry(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}
