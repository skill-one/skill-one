import {
  cacheBusted,
  fetchFirstStreamInOrder,
  fetchSignal,
  fileCandidates,
  type FileSpec,
} from "../cdn-config";
import { MIRROR } from "../mirror";
import type { Skill } from "../../types/skill";
import { jsonLine, parseSkillLine, type StarsFor } from "./parse";

/**
 * Streaming reader for the registry snapshot: establishes which published
 * version is current, then splits the response body into JSONL lines and
 * hands every parsed skill to the caller. Runs inside the registry worker.
 *
 * Version resolution is etag-only: upstream publishes every snapshot to the
 * `dist` branch and states nothing else about currency — no pointer file, no
 * per-run stats — so the branch body's etag is the version identity. GitHub's
 * API is deliberately never called: an anonymous API probe is rate-limited
 * per IP and is the one request in the data layer that can be refused for
 * reasons the app cannot control. The etag makes an equally valid freshness
 * identity (equal etag, equal index bytes), and the `HEAD` that reads it
 * costs only headers. Two cache policies follow:
 *
 * - The `HEAD` probe is always cache-busted: a stale answer would pin the
 *   whole download to yesterday's snapshot.
 * - `skills.jsonl` and `repos.jsonl` are read off the mutable `dist` branch,
 *   also cache-busted: without a commit SHA to pin to, a stale edge copy
 *   could otherwise pass for the current publish.
 */

/**
 * The snapshot's freshness identity as the current source reports it: the
 * branch body's etag (a content hash — equal etag, equal index bytes) plus
 * the body's `Last-Modified` stamp when the source gives one (display
 * garnish; the etag alone drives the "unchanged" short-circuit).
 */
export interface SnapshotHead {
  etag: string;
  publishedAt?: string;
}

/**
 * The dataset repo publishes the whole dataset to its `dist` branch as a
 * snapshot. Each row already carries the profile classification (`domain`),
 * so the catalog *is* the dataset — there is no second source decoration step.
 */
const INDEX_SPEC = {
  repo: MIRROR.repo,
  path: "skills.jsonl",
  ref: MIRROR.ref,
} as const;

/**
 * Per-repo metadata sidecar (GitHub stars; one row per repo). Star counts
 * left the skill rows themselves — this file is their join table, keyed by
 * the `id` field (`{owner}/{repo}`), the first two segments of every index id.
 */
const REPOS_SPEC = { ...INDEX_SPEC, path: "repos.jsonl" } as const;

/**
 * Candidate URLs for one snapshot file: the mutable `dist` branch through the
 * configured download source, cache-busted — with no commit SHA to pin to,
 * only the bust keeps a lagging edge copy from passing for the current
 * snapshot.
 */
function snapshotUrls(spec: FileSpec, cdnBase: string): string[] {
  return fileCandidates(spec, cdnBase).map(cacheBusted);
}

/**
 * Silence allowed between body chunks before the read is treated as stalled.
 * The per-request timeout only guards the response headers, so this is what
 * keeps a dead connection from hanging the load forever.
 */
const CHUNK_TIMEOUT_MS = 15_000;

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
 * Probe the currently published snapshot: `HEAD` the branch's index body
 * (cache-busted) through the candidate chain and read its etag — a content
 * hash that makes a valid freshness identity (equal etag, equal index bytes).
 * The body's `Last-Modified` stamp rides along when the source gives one, so
 * Settings can still say when the snapshot was published.
 *
 * `HEAD` transfers no body, so probing the multi-megabyte file costs only
 * headers. Returns null when no source answers, which leaves the version
 * undatable — the next boot re-downloads once.
 */
export async function probeIndexMeta(
  cdnBase: string,
): Promise<SnapshotHead | null> {
  for (const url of snapshotUrls(INDEX_SPEC, cdnBase)) {
    try {
      const resp = await fetch(url, { method: "HEAD", signal: fetchSignal() });
      if (!resp.ok) continue;
      const etag = resp.headers.get("etag");
      if (etag) {
        return {
          etag,
          publishedAt: resp.headers.get("last-modified") ?? undefined,
        };
      }
    } catch {
      // Unreachable or timed out: give the next source a turn.
    }
  }
  return null;
}

/**
 * Repo → GitHub-star lookup over the snapshot's `repos.jsonl` sidecar, keyed
 * by the row's `id` (`{owner}/{repo}`). Read off the mutable `dist` branch,
 * cache-busted like the index body. Rows whose `stars` is null (a repo gone
 * from GitHub) are dropped, so lookups normalize to 0.
 *
 * Like the old run stats, this is garnish, not the dataset: the caller turns
 * a fetch failure into "no join", which leaves every skill with 0 stars
 * rather than failing the download.
 */
export async function readRepos(cdnBase: string): Promise<Map<string, number>> {
  const stars = new Map<string, number>();
  await fetchFirstStreamInOrder(
    snapshotUrls(REPOS_SPEC, cdnBase),
    async (body) => {
      stars.clear();
      await readLines(body, (line) => {
        const row = jsonLine<{ id?: unknown; stars?: unknown }>(line);
        if (
          row &&
          typeof row.id === "string" &&
          typeof row.stars === "number"
        ) {
          stars.set(row.id, row.stars);
        }
      });
    },
  );
  return stars;
}

/**
 * Stream the index from the freshest source, handing every parsed skill to
 * `onLine`. The mutable `dist` branch is the only address — cache-busted, so
 * a stale edge copy can never be mistaken for the current index.
 *
 * `stars` is the in-flight `repos.jsonl` fetch started by the caller so its
 * latency hides inside the multi-megabyte body download; it is awaited once
 * the body's first candidate connects, so every parsed line can already join
 * against the complete map (a null resolution — the sidecar was unreachable —
 * joins nothing, leaving stars at 0). The CDN base is passed in by the main
 * thread: workers have no `localStorage`, so the user's configured download
 * source cannot be read here. A candidate that fails mid-stream falls back to
 * the next one, restarting the parse from scratch via `onRestart`.
 */
export async function readIndex(
  cdnBase: string,
  stars: Promise<Map<string, number> | null>,
  onLine: (skill: Skill) => void,
  onRestart: () => void,
): Promise<void> {
  await fetchFirstStreamInOrder(
    snapshotUrls(INDEX_SPEC, cdnBase),
    async (body) => {
      onRestart();
      // The sidecar fetch runs concurrently with the body; by the time a
      // candidate answers it has long settled (it never rejects: the caller
      // catches). One await per attempt — on fallback restarts it re-reads
      // the same resolved map instead of re-fetching.
      const starsFor: StarsFor | undefined = await stars.then(
        (map): StarsFor | undefined =>
          map ? (repo) => map.get(repo) : undefined,
      );
      await readLines(body, (line) => {
        const skill = parseSkillLine(line, starsFor);
        if (skill) onLine(skill);
      });
    },
  );
}
