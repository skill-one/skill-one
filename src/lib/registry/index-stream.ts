import {
  cacheBusted,
  fetchFirstStreamInOrder,
  fetchSignal,
  fileCandidates,
  type FileSpec,
} from "../cdn-config";
import { MIRROR } from "../mirror";
import {
  readSnapshotHead,
  type SnapshotSource,
  type SnapshotHead,
} from "./snapshot";
import type { Skill } from "../../types/skill";
import { jsonLine, parseSkillLine, type StarsFor } from "./parse";

/**
 * Streaming reader for the registry snapshot: resolves which published
 * version to use, then splits the response body into JSONL lines and hands
 * every parsed skill to the caller. Runs inside the registry worker.
 *
 * Version resolution is branch-head-first (see `snapshot.ts`): upstream
 * publishes every snapshot to the `dist` branch and states nothing else about
 * currency — no pointer file, no per-run stats — so the branch head's commit
 * SHA is what names the version everything else is addressed through. Two
 * cache policies follow:
 *
 * - The branch head is a mutable pointer, so its one small API request is
 *   always cache-busted — a stale answer defeats its purpose. The commit date
 *   it reports is the snapshot's freshness identity (equal dates mean equal
 *   bytes: a run publishes once), which drives the "unchanged" short-circuit.
 * - `skills.jsonl` and `repos.jsonl` are fetched pinned to the commit SHA, so
 *   their URLs are content-addressed and immutable: a cached copy is by
 *   definition the right bytes, and a CDN that lags behind can only serve the
 *   *same* version. Callers compare the stamp against their own cache to
 *   decide whether the multi-megabyte body needs downloading at all.
 */

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
 * The dataset repo's snapshot source: the rolling `dist` branch, whose head
 * commit names the snapshot.
 */
const INDEX_SOURCE: SnapshotSource = {
  repo: INDEX_SPEC.repo,
  branch: INDEX_SPEC.ref,
};

/**
 * Candidate URLs for one snapshot file, addressed by the file's own policy:
 * pinned to the snapshot's commit SHA when one is resolved — immutable, so
 * cache-safe, and a lagging CDN can only serve the same snapshot — and read
 * off the mutable branch cache-busted when none is, since a stale copy there
 * would pass for the current publish.
 */
function snapshotUrls(
  spec: FileSpec,
  cdnBase: string,
  ref?: string,
): string[] {
  const urls = fileCandidates({ ...spec, ref: ref ?? spec.ref }, cdnBase);
  return ref ? urls : urls.map(cacheBusted);
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
 * Probe the currently published snapshot, resolving its identity in two
 * stages. Primary: the repo's `dist` branch head via one small GitHub API
 * request, which answers with the commit SHA (the immutable ref the body is
 * fetched at) and the commit date (the publication stamp). Degraded: when
 * the API does not answer — rate-limited or blocked egress IPs are common —
 * a cache-busted `HEAD` on the branch's `skills.jsonl` answers with its
 * etag, a content hash that makes an equally valid freshness identity (equal
 * etag, equal index bytes). The body is then not pinned, but the "unchanged"
 * short-circuit still works.
 *
 * Returns null when neither stage answered, which leaves the caller to fall
 * back to the mutable branch ref: the version stays unpinned and undatable,
 * so the next boot re-downloads once.
 */
export async function probeIndexMeta(
  cdnBase: string,
): Promise<SnapshotHead | null> {
  const head = await readSnapshotHead(INDEX_SOURCE).catch(() => null);
  if (head) return head;
  return probeBranchEtag(cdnBase);
}

/**
 * Degraded identity probe: `HEAD` the branch body (cache-busted) through the
 * candidate chain and read its etag. `HEAD` transfers no body, so probing
 * the multi-megabyte file costs only headers.
 */
async function probeBranchEtag(cdnBase: string): Promise<SnapshotHead | null> {
  for (const url of snapshotUrls(INDEX_SPEC, cdnBase)) {
    try {
      const resp = await fetch(url, { method: "HEAD", signal: fetchSignal() });
      if (!resp.ok) continue;
      const etag = resp.headers.get("etag");
      if (etag) return { generatedAt: etag };
    } catch {
      // Unreachable or timed out: give the next source a turn.
    }
  }
  return null;
}

/**
 * Repo → GitHub-star lookup over the snapshot's `repos.jsonl` sidecar, keyed
 * by the row's `id` (`{owner}/{repo}`). Follows the same addressing rules as
 * the index body: pinned to the snapshot SHA when one is known (immutable,
 * cache-safe), fetched off the mutable `dist` branch cache-busted otherwise.
 * Rows whose `stars` is null (a repo gone from GitHub) are dropped, so
 * lookups normalize to 0.
 *
 * Like the old run stats, this is garnish, not the dataset: the caller turns
 * a fetch failure into "no join", which leaves every skill with 0 stars
 * rather than failing the download.
 */
export async function readRepos(
  cdnBase: string,
  ref?: string,
): Promise<Map<string, number>> {
  const stars = new Map<string, number>();
  await fetchFirstStreamInOrder(
    snapshotUrls(REPOS_SPEC, cdnBase, ref),
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
 * `onLine`. `ref` pins the download to an immutable snapshot (see
 * `probeIndexMeta`); without one the mutable `dist` branch is used, and only
 * that fallback path is cache-busted — otherwise a stale edge copy could be
 * mistaken for the current index, which is exactly the failure the SHA pin
 * exists to remove.
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
  ref: string | undefined,
  stars: Promise<Map<string, number> | null>,
  onLine: (skill: Skill) => void,
  onRestart: () => void,
): Promise<void> {
  await fetchFirstStreamInOrder(
    snapshotUrls(INDEX_SPEC, cdnBase, ref),
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
