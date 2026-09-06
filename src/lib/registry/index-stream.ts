import {
  cacheBusted,
  fetchFirstStreamInOrder,
  fetchSignal,
  fileCandidates,
} from "../cdn-config";
import type { Skill } from "../../types/skill";
import { parseSkillLine } from "./parse";

/**
 * Streaming reader for the registry snapshot: resolves which published
 * version to use, then splits the response body into JSONL lines and hands
 * every parsed skill to the caller. Runs inside the registry worker.
 *
 * Two files, two cache policies:
 *
 * - `stats.json` sits on the mutable `dist` branch and is tiny, so it is
 *   always requested cache-busted — it is the freshness oracle and a stale
 *   answer defeats its own purpose. Its `finishedAt` both identifies the
 *   snapshot (equal stamps mean equal bytes: a run publishes once) and dates
 *   the immutable `dist-<date>` tag the body is pinned to.
 * - `skills.jsonl` is fetched through that `dist-<date>` tag, so its URL is
 *   content-addressed and immutable: a cached copy is by definition the right
 *   bytes, and a CDN that lags behind can only serve the *same* version
 *   (same-day re-runs force-move the tag to the newest snapshot, which the
 *   changed `finishedAt` detects and re-downloads). Callers compare the stamp
 *   against their own cache to decide whether the multi-megabyte body needs
 *   downloading at all.
 */

/**
 * The skills-sh-scraper repo publishes the full index (JSONL) to its `dist`
 * branch as a daily snapshot.
 */
const INDEX_SPEC = {
  repo: "skill-one/skills-sh-scraper",
  path: "skills.jsonl",
  ref: "dist",
} as const;

/** Sidecar run stats published next to the index. */
const META_SPEC = { ...INDEX_SPEC, path: "stats.json" } as const;

/** The trending view's top ids, re-fetched from upstream on every run. */
const TRENDING_SPEC = { ...INDEX_SPEC, path: "trending.json" } as const;

/**
 * Silence allowed between body chunks before the read is treated as stalled.
 * The per-request timeout only guards the response headers, so this is what
 * keeps a dead connection from hanging the load forever.
 */
const CHUNK_TIMEOUT_MS = 15_000;

/** A UTC calendar date, the form `dist-<date>` tags are named with. */
const UTC_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Freshness and shape of the currently published snapshot, as reported by
 * the run's stats.
 */
interface RawRunStats {
  startedAt?: unknown;
  finishedAt?: unknown;
  indexedRows?: unknown;
}

/**
 * Normalized facts about the currently published snapshot. Fields are
 * optional because a partial or future-shaped stats file simply omits them;
 * the caller treats a missing `tag` as "cannot pin", and a missing
 * `generatedAt` as "cannot skip".
 */
export interface PublishedIndex {
  /** Immutable `dist-<date>` tag the index body can be fetched at. */
  tag?: string;
  /** UTC stamp of the run that produced the snapshot (second precision). */
  generatedAt?: string;
  /** Published row count, before any consumer-side filtering. */
  total?: number;
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
 * Probe the published run stats, trying each download source in priority
 * order and returning the first that answers with a usable body.
 *
 * The walk is sequential by design: the pointer costs ~300 B, so racing three
 * sources would buy nothing, while an ordered walk keeps the user's configured
 * CDN first in line. Every attempt is cache-busted, so a source that answers at
 * all answers for the current publish rather than for a cached one — a stale
 * mirror must not pass yesterday's snapshot off as current, and with the body
 * tag-addressed the staleness cannot recur downstream either.
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
      const stats: unknown = await resp.json();
      if (!stats || typeof stats !== "object") continue;
      return normalize(stats as RawRunStats);
    } catch {
      // Unreachable, timed out, or not JSON: give the next source a turn.
    }
  }
  return null;
}

/**
 * Keep only the fields we can actually use; junk becomes `undefined`.
 *
 * The tag is derived from the run's finish date, mirroring how upstream CI
 * names its tags (the commit is stamped `date -u +%F` right after the run).
 * A stamp that is not a UTC calendar date pins nothing — the caller falls
 * back to the mutable branch rather than building a bogus URL.
 */
function normalize(raw: RawRunStats): PublishedIndex {
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.length > 0 ? value : undefined;
  const count = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const finishedAt = text(raw.finishedAt);
  const day = finishedAt?.slice(0, 10);
  return {
    tag: day && UTC_DATE.test(day) ? `dist-${day}` : undefined,
    generatedAt: finishedAt,
    total: count(raw.indexedRows),
  };
}

/**
 * Fetch the trending view's id list, trying each download source in priority
 * order like the stats probe (cache-busted: it is republished on every run).
 *
 * The list is an optional garnish, not the dataset — an unreachable or
 * future-shaped source simply yields null, which callers treat as "no
 * trending leaderboard" rather than a download failure.
 */
export async function readTrending(
  cdnBase: string,
): Promise<string[] | null> {
  for (const url of fileCandidates(TRENDING_SPEC, cdnBase)) {
    try {
      const resp = await fetch(cacheBusted(url), { signal: fetchSignal() });
      if (!resp.ok) continue;
      const ids: unknown = await resp.json();
      if (!Array.isArray(ids)) continue;
      if (!ids.every((id) => typeof id === "string")) continue;
      return ids;
    } catch {
      // Unreachable, timed out, or not JSON: give the next source a turn.
    }
  }
  return null;
}

/**
 * Stream the index from the freshest source, handing every parsed skill to
 * `onLine`. `tag` pins the download to an immutable snapshot (see
 * `probeIndexMeta`); without one the mutable `dist` branch is used, and only
 * that fallback path is cache-busted — otherwise a stale edge copy could be
 * mistaken for the current index, which is exactly the failure the tag pin
 * exists to remove.
 *
 * The CDN base is passed in by the main thread: workers have no
 * `localStorage`, so the user's configured download source cannot be read
 * here. A candidate that fails mid-stream falls back to the next one,
 * restarting the parse from scratch via `onRestart`.
 */
export async function readIndex(
  cdnBase: string,
  tag: string | undefined,
  onLine: (skill: Skill) => void,
  onRestart: () => void,
): Promise<void> {
  const spec = { ...INDEX_SPEC, ref: tag ?? INDEX_SPEC.ref };
  const urls = fileCandidates(spec, cdnBase).map((url) =>
    tag ? url : cacheBusted(url),
  );
  await fetchFirstStreamInOrder(urls, async (body) => {
    onRestart();
    await readLines(body, (line) => {
      const skill = parseSkillLine(line);
      if (skill) onLine(skill);
    });
  });
}
