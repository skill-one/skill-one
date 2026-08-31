import { createRegistryController } from "../lib/registry/worker-controller";
import type {
  FeaturedData,
  PageData,
  PageRequest,
  RankingData,
  RankingRequest,
  RegistryWorkerMessage,
  SkillRef,
} from "../lib/registry/protocol";
import type { RegistrySnapshot } from "../lib/registry/client";
import type { Skill } from "../types/skill";

/**
 * In-memory stand-in for the registry worker, driven by the real controller:
 * component tests exercise the exact request/event contract the real worker
 * speaks, with a test-controlled download stream instead of the network.
 *
 * Listener notifications are coalesced onto a microtask so a single
 * `pushAll` (which posts one progress message per skill) re-renders the
 * component under test once, not once per skill.
 */
export interface RegistryHarness {
  /** Boot the controller like the real worker does on `init`. */
  init(): void;
  /** Source switch / retry path. */
  reload(): void;
  /** Serve `skills` from the active download stream. */
  pushAll(skills: Skill[]): void;
  /** Complete the active download: data lands, the index builds, ready fires. */
  complete(): void;
  /** Fail the active download. */
  fail(err: unknown): void;
  /** How many downloads (init + reloads) have started. */
  readonly downloads: number;
  /** Make every RPC reject (worker crash stand-in) until cleared. */
  setRpcError(err: Error | null): void;
  getPage(req: PageRequest): Promise<PageData>;
  getFeatured(): Promise<FeaturedData>;
  getRanking(req: RankingRequest): Promise<RankingData>;
  lookupSkills(refs: SkillRef[]): Promise<{ entries: Array<Skill | null> }>;
  getSnapshot(): RegistrySnapshot;
  subscribe(listener: () => void): () => void;
  /** Reset all state between tests; keeps registered listeners. */
  reset(): void;
}

const INITIAL_SNAPSHOT: RegistrySnapshot = {
  count: 0,
  complete: false,
  indexing: false,
  ready: false,
  epoch: 0,
  error: null,
};

export function createRegistryHarness(): RegistryHarness {
  let snapshot: RegistrySnapshot = INITIAL_SNAPSHOT;
  const listeners = new Set<() => void>();

  let queued = false;
  const emit = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      for (const listener of [...listeners]) listener();
    });
  };

  let downloads = 0;
  let rpcError: Error | null = null;
  let onLine: ((skill: Skill) => void) | null = null;
  let settle: { resolve(): void; reject(err: unknown): void } | null = null;
  // Skills/completions that arrive before the (async) boot chain opened the
  // stream: replayed the moment `readIndex` starts.
  let earlyBuffer: Skill[] = [];
  let earlyOutcome: "none" | "complete" | "fail" = "none";
  let earlyError: unknown;

  const replies = new Map<
    number,
    { ok: true; data: unknown } | { ok: false; error: string }
  >();
  let nextId = 0;

  let controller = spawnController();

  function spawnController() {
    return createRegistryController(
      {
        readIndex: async (_cdnBase, line) => {
          downloads++;
          onLine = line;
          for (const skill of earlyBuffer) line(skill);
          earlyBuffer = [];
          // The early outcome is a one-shot: it describes the boot stream
          // only, so consume it or every later retry would replay it.
          const outcome = earlyOutcome;
          earlyOutcome = "none";
          if (outcome === "complete") return;
          if (outcome === "fail") throw earlyError;
          await new Promise<void>((resolve, reject) => {
            settle = { resolve, reject };
          });
        },
        cache: {
          load: async () => null,
          save: async () => {},
          clear: async () => {},
        },
        now: () => 0,
      },
      onWorkerMessage,
    );
  }

  function onWorkerMessage(message: RegistryWorkerMessage) {
    if (message.type === "progress") {
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
    } else if (message.type === "result") {
      replies.set(
        message.id,
        message.ok
          ? { ok: true, data: message.data }
          : { ok: false, error: message.error },
      );
    }
  }

  async function request<T>(
    type: "getPage" | "getFeatured" | "getRanking" | "lookupSkills",
    payload?: unknown,
  ): Promise<T> {
    if (rpcError) throw rpcError;
    const id = ++nextId;
    controller.handle({ type, id, payload } as never);
    const reply = replies.get(id);
    if (!reply) throw new Error("harness: no reply for request");
    replies.delete(id);
    if (!reply.ok) throw new Error(reply.error);
    return reply.data as T;
  }

  return {
    init() {
      controller.init({ cdnBase: "test" });
    },
    reload() {
      // Mirror the real client: a user-facing retry clears the error banner.
      snapshot = { ...snapshot, error: null };
      emit();
      controller.reload({ cdnBase: "test" });
    },
    pushAll(skills) {
      if (onLine) for (const skill of skills) onLine(skill);
      else earlyBuffer.push(...skills);
    },
    complete() {
      if (settle) {
        settle.resolve();
        settle = null;
      } else {
        earlyOutcome = "complete";
      }
    },
    fail(err) {
      if (settle) {
        settle.reject(err);
        settle = null;
      } else {
        earlyOutcome = "fail";
        earlyError = err;
      }
    },
    get downloads() {
      return downloads;
    },
    setRpcError(err) {
      rpcError = err;
    },
    getPage(req) {
      return request<PageData>("getPage", req);
    },
    getFeatured() {
      return request<FeaturedData>("getFeatured");
    },
    getRanking(req) {
      return request<RankingData>("getRanking", req);
    },
    lookupSkills(refs) {
      return request<{ entries: Array<Skill | null> }>("lookupSkills", {
        refs,
      });
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      snapshot = INITIAL_SNAPSHOT;
      replies.clear();
      nextId = 0;
      downloads = 0;
      rpcError = null;
      onLine = null;
      settle = null;
      earlyBuffer = [];
      earlyOutcome = "none";
      earlyError = undefined;
      controller = spawnController();
    },
  };
}

/** Shape of the mocked `lib/registry/client` module for component tests. */
export function createRegistryClientMock(harness: RegistryHarness) {
  return {
    __harness: harness,
    initRegistry: () => harness.init(),
    reloadRegistry: () => harness.reload(),
    getPage: (req: PageRequest) => harness.getPage(req),
    getFeatured: () => harness.getFeatured(),
    getRanking: (req: RankingRequest) => harness.getRanking(req),
    lookupSkills: (refs: SkillRef[]) => harness.lookupSkills(refs),
    getRegistrySnapshot: () => harness.getSnapshot(),
    subscribeRegistry: (listener: () => void) => harness.subscribe(listener),
    resetRegistryClient: () => harness.reset(),
  };
}
