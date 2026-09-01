import {
  cacheBusted,
  fetchFirstStreamInOrder,
  fetchSignal,
  fileCandidates,
} from "../cdn-config";
import type { Skill } from "../../types/skill";
import { parseSkillLine } from "./parse";

/**
 * Streaming reader for the registry index: resolves which published version to
 * use, then splits the response body into JSONL lines and hands every parsed
 * skill to the caller. Runs inside the registry worker.
 *
 * Two files, two cache policies:
 *
 * - `index-meta.json` sits on the mutable `dist` branch and is tiny, so it is
 *   always requested cache-busted — it is the freshness oracle and a stale
 *   answer defeats its own purpose.
 * - `index.jsonl` is fetched through the `distCommit` that meta advertises, so
 *   its URL is content-addressed and immutable: a cached copy is by definition
 *   the right bytes, and a CDN that lags behind can only serve the *same*
 *   version. Callers compare that commit against their own cache to decide
 *   whether the multi-megabyte body needs downloading at all.
 */

/** The skills-index repo publishes the full index (JSONL) to its `dist` branch. */
const INDEX_SPEC = {
  repo: "skill-one/skills-index",
  path: "index.jsonl",
  ref: "dist",
} as const;

/** Sidecar metadata published next to the index. */
const META_SPEC = { ...INDEX_SPEC, path: "index-meta.json" } as const;

/**
 * Silence allowed between body chunks before the read is treated as stalled.
 * The per-request timeout only guards the response headers, so this is what
 * keeps a dead connection from hanging the load forever.
 */
const CHUNK_TIMEOUT_MS = 15_000;

/**
 * A commit sha, in the short or full form GitHub emits. Anything else is
 * dropped rather than interpolated into a download URL.
 */
const COMMIT = /^[0-9a-f]{7,40}$/i;

/** Freshness and shape of the published index, as advertised by its meta file. */
interface RawIndexMeta {
  formatVersion?: unknown;
  generatedAt?: unknown;
  distCommit?: unknown;
  counts?: { total?: unknown };
}

/**
 * Normalized facts about the currently published snapshot. Fields are optional
 * because older meta files and mirrors lagging behind a format change simply
 * omit them; the caller treats a missing `commit` as "cannot pin, cannot skip".
 */
export interface PublishedIndex {
  /** Immutable commit the index body can be fetched at. */
  commit?: string;
  /** Second-precision UTC generation stamp. */
  generatedAt?: string;
  /** Published entry count, before any consumer-side filtering. */
  total?: number;
  /** Record format of the published index. */
  formatVersion?: number;
}

/**
 * Read a response body as decoded text lines, delivering each complete line
 * to `onLine` as it arrives. Decoding uses `TextDecoder`'s streaming mode
 * rather than `TextDecoderStream`, which is missing on older WebKit builds
 * the app still supports.
 */
export async function readLines(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  type ReadResult = Awaited<ReturnType<typeof reader.read>>;
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await new Promise<ReadResult>(
        (resolve, reject) => {
          const stall = setTimeout(
            () => reject(new Error("response stalled")),
            CHUNK_TIMEOUT_MS,
          );
          reader.read().then(
            (result) => {
              clearTimeout(stall);
              resolve(result);
            },
            (err: unknown) => {
              clearTimeout(stall);
              reject(err);
            },
          );
        },
      );
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // Only complete lines are parseable; the trailing fragment stays
      // buffered until its remainder arrives.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) onLine(line);
    }
    // A final line without a trailing newline is still a line.
    buffer += decoder.decode();
    if (buffer.length > 0) onLine(buffer);
  } finally {
    // Release the connection when abandoning a half-read body (the candidate
    // fallback has moved on to another source).
    reader.cancel().catch(() => {});
  }
}

/**
 * Probe the published index metadata, trying each download source in priority
 * order and returning the first that answers with a usable body.
 *
 * The walk is sequential by design: the pointer costs ~300 B, so racing three
 * sources would buy nothing, while an ordered walk keeps the user's configured
 * CDN first in line. Every attempt is cache-busted, so a source that answers at
 * all answers for the current publish rather than for a cached one — the
 * staleness that used to require ranking candidates by `generatedAt` cannot
 * occur here, and with the body commit-addressed it cannot occur downstream
 * either.
 *
 * Returns null when no source could be reached, which leaves the caller to
 * fall back to the mutable branch ref.
 */
export async function probeIndexMeta(
  cdnBase: string,
): Promise<PublishedIndex | null> {
  for (const url of fileCandidates(META_SPEC, cdnBase)) {
    try {
      const resp = await fetch(cacheBusted(url), { signal: fetchSignal() });
      if (!resp.ok) continue;
      const meta: unknown = await resp.json();
      if (!meta || typeof meta !== "object") continue;
      return normalize(meta as RawIndexMeta);
    } catch {
      // Unreachable, timed out, or not JSON: give the next source a turn.
    }
  }
  return null;
}

/** Keep only the fields we can actually use; junk becomes `undefined`. */
function normalize(raw: RawIndexMeta): PublishedIndex {
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.length > 0 ? value : undefined;
  const count = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const commit = text(raw.distCommit);
  return {
    // Anything but a sha would build a bogus download URL, so it is dropped.
    commit: commit && COMMIT.test(commit) ? commit : undefined,
    generatedAt: text(raw.generatedAt),
    total: count(raw.counts?.total),
    formatVersion: count(raw.formatVersion),
  };
}

/**
 * Stream the index from the freshest source, handing every parsed skill to
 * `onLine`. `commit` pins the download to an immutable snapshot (see
 * `probeIndexMeta`); without one the mutable `dist` branch is used, and only
 * that fallback path is cache-busted — otherwise a stale edge copy could be
 * mistaken for the current index, which is exactly the failure the commit pin
 * exists to remove.
 *
 * The CDN base is passed in by the main thread: workers have no
 * `localStorage`, so the user's configured download source cannot be read
 * here. A candidate that fails mid-stream falls back to the next one,
 * restarting the parse from scratch via `onRestart`.
 */
export async function readIndex(
  cdnBase: string,
  commit: string | undefined,
  onLine: (skill: Skill) => void,
  onRestart: () => void,
): Promise<void> {
  const spec = { ...INDEX_SPEC, ref: commit ?? INDEX_SPEC.ref };
  const urls = fileCandidates(spec, cdnBase).map((url) =>
    commit ? url : cacheBusted(url),
  );
  await fetchFirstStreamInOrder(urls, async (body) => {
    onRestart();
    await readLines(body, (line) => {
      const skill = parseSkillLine(line);
      if (skill) onLine(skill);
    });
  });
}
