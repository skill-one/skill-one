import { getCdnBase } from "../cdn-config";
import type {
  FeaturedData,
  PageData,
  PageRequest,
  RepoPageData,
  ReposRequest,
  RegistryWorkerMessage,
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
}

const INITIAL_SNAPSHOT: RegistrySnapshot = {
  count: 0,
  complete: false,
  indexing: false,
  ready: false,
  epoch: 0,
  error: null,
};

let worker: Worker | null = null;
let workerFactory: () => Worker = () =>
  new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
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
  } else if (message.type === "error") {
    snapshot = { ...snapshot, error: message.message };
    emit();
  }
}

function ensureWorker(): Worker {
  worker ??= workerFactory();
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
  type: "getPage" | "getRepos" | "getFeatured" | "lookupSkills",
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
export function initRegistry(options?: { workerFactory?: () => Worker }) {
  if (options?.workerFactory) workerFactory = options.workerFactory;
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

/** One paged explore result (browse or search). */
export function getPage(request_: PageRequest): Promise<PageData> {
  return request("getPage", request_) as Promise<PageData>;
}

/** One paged repos result (browse or search). */
export function getRepos(request_: ReposRequest): Promise<RepoPageData> {
  return request("getRepos", request_) as Promise<RepoPageData>;
}

/** Featured payload; call only once `ready` (see useRegistryStats). */
export function getFeatured(): Promise<FeaturedData> {
  return request("getFeatured") as Promise<FeaturedData>;
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
