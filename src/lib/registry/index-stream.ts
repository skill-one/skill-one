import {
  cacheBusted,
  fetchFirstStreamInOrder,
  fetchSignal,
  fileCandidates,
} from "../cdn-config";
import type { Skill } from "../../types/skill";
import { parseSkillLine } from "./parse";
import { readLatestTag } from "./snapshot";
import type { SnapshotSource } from "./snapshot";

/**
 * Streaming reader for the registry snapshot: resolves which published
 * version to use, then splits the response body into JSONL lines and hands
 * every parsed skill to the caller. Runs inside the registry worker.
 *
 * Version resolution is pointer-first (see `snapshot.ts`): upstream publishes
 * every daily snapshot to the `dist` branch and writes a `latest` file beside
 * it holding the tag that branch points at, so a single small read names the
 * version everything else is addressed through. Two cache policies follow:
 *
 * - The `latest` pointer and the `dist` branch are mutable pointers, so their
 *   requests are always cache-busted — a stale answer defeats their purpose.
 *   `stats.json` read pinned to the resolved tag is immutable, so it is not
 *   busted; its `finishedAt` identifies the snapshot (equal stamps mean equal
 *   bytes: a run publishes once) and dates it.
 * - `skills.jsonl` is fetched through the `dist-<date>` tag, so its URL is
 *   content-addressed and immutable: a cached copy is by definition the right
 *   bytes, and a CDN that lags behind can only serve the *same* version
 *   (same-day re-runs force-move the tag to the newest snapshot, which the
 *   changed `finishedAt` detects and re-downloads). Callers compare the stamp
 *   against their own cache to decide whether the multi-megabyte body needs
 *   downloading at all.
 */

/**
 * The skills-sh-mirror repo publishes the full index (JSONL) to its `dist`
 * branch as a daily snapshot.
 */
const INDEX_SPEC = {
  repo: "skill-one/skills-sh-mirror",
  path: "skills.jsonl",
  ref: "dist",
} as const;

/** Sidecar run stats published next to the index. */
const META_SPEC = { ...INDEX_SPEC, path: "stats.json" } as const;

/** The trending view's top ids, re-fetched from upstream on every run. */
const TRENDING_SPEC = { ...INDEX_SPEC, path: "trending.json" } as const;

/**
 * The mirror's pointer contract: the `latest` file at the `dist` root names a
 * `dist-` tag with a UTC calendar date.
 */
const INDEX_SOURCE: SnapshotSource = {
  repo: INDEX_SPEC.repo,
  branch: INDEX_SPEC.ref,
  tag: /^dist-\d{4}-\d{2}-\d{2}$/,
};

/**
 * Silence allowed between body chunks before the read is treated as stalled.
 * The per-request timeout only guards the response headers, so this is what
 * keeps a dead connection from hanging the load forever.
 */
const CHUNK_TIMEOUT_MS = 15_000;

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
 * Probe the currently published snapshot, resolving its identity from the
 * repo's `latest` pointer: that single line names the tag, and `stats.json` is
 * then read **pinned to that tag** — an immutable address, so no busting is
 * needed and a lagging CDN can only serve the same snapshot's stats. The stats
 * supply the publication stamp and row count; if they cannot be read the tag
 * alone still pins the download.
 *
 * When the pointer cannot be read at all, the branch's own `stats.json` is
 * probed cache-busted for the stamp — busted because a source that answers
 * must answer for the current publish, or a stale mirror would pass
 * yesterday's snapshot off as current. No tag is derived on that path: the
 * version simply stays unpinned, costing the body its immutable address while
 * still letting the caller skip one it already has.
 *
 * Returns null when neither path could reach a source, which leaves the
 * caller to fall back to the mutable branch ref.
 */
export async function probeIndexMeta(
  cdnBase: string,
): Promise<PublishedIndex | null> {
  const tag = await readLatestTag(cdnBase, INDEX_SOURCE);
  if (!tag) return probeBranchStats(cdnBase);
  const stats = await readStatsAt(cdnBase, tag);
  return stats ? { ...normalizeStats(stats), tag } : { tag };
}

/** Fetch `stats.json` pinned to an immutable snapshot tag (no cache-busting). */
async function readStatsAt(
  cdnBase: string,
  tag: string,
): Promise<RawRunStats | null> {
  for (const url of fileCandidates({ ...META_SPEC, ref: tag }, cdnBase)) {
    try {
      const resp = await fetch(url, { signal: fetchSignal() });
      if (!resp.ok) continue;
      const stats: unknown = await resp.json();
      if (stats && typeof stats === "object") return stats as RawRunStats;
    } catch {
      // Unreachable, timed out, or not JSON: give the next source a turn.
    }
  }
  return null;
}

/**
 * Degraded probe, used when the `latest` pointer is unreadable: read
 * `stats.json` off the mutable branch, cache-busted. The stamp and count still
 * drive the caller's "unchanged" short-circuit; only the tag is unknown, which
 * costs the download its immutable address.
 */
async function probeBranchStats(
  cdnBase: string,
): Promise<PublishedIndex | null> {
  for (const url of fileCandidates(META_SPEC, cdnBase)) {
    try {
      const resp = await fetch(cacheBusted(url), { signal: fetchSignal() });
      if (!resp.ok) continue;
      const stats: unknown = await resp.json();
      if (!stats || typeof stats !== "object") continue;
      return normalizeStats(stats as RawRunStats);
    } catch {
      // Unreachable, timed out, or not JSON: give the next source a turn.
    }
  }
  return null;
}

/**
 * Keep only the fields we can actually use; junk becomes `undefined`. The tag
 * is deliberately not derived here — it comes from the `latest` pointer, which
 * is upstream's own statement of it rather than our guess at its naming
 * convention.
 */
function normalizeStats(raw: RawRunStats): PublishedIndex {
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.length > 0 ? value : undefined;
  const count = (value: unknown): number | undefined =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  return {
    generatedAt: text(raw.finishedAt),
    total: count(raw.indexedRows),
  };
}

/**
 * Fetch the trending view's id list. When a snapshot tag is known the fetch
 * is pinned to it, so the leaderboard is read from the same snapshot as the
 * index and its URL is cache-safe; without a tag the mutable `dist` branch is
 * probed cache-busted, like the branch stats probe.
 *
 * The list is an optional garnish, not the dataset — an unreachable or
 * future-shaped source simply yields null, which callers treat as "no
 * trending leaderboard" rather than a download failure.
 */
export async function readTrending(
  cdnBase: string,
  tag?: string,
): Promise<string[] | null> {
  const spec = { ...TRENDING_SPEC, ref: tag ?? TRENDING_SPEC.ref };
  for (const url of fileCandidates(spec, cdnBase)) {
    try {
      const busted = tag ? url : cacheBusted(url);
      const resp = await fetch(busted, { signal: fetchSignal() });
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
