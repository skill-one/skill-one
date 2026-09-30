import { cacheBusted, fetchFirstJson } from "../cdn-config";

/**
 * Resolving the dataset's current snapshot — the contract the dataset repo
 * publishes.
 *
 * `skill-one/skills-profiles` publishes a complete dataset snapshot to its
 * `dist` branch on a schedule. The branch is a mutable pointer, so a URL at
 * it can be answered by an edge cache with a day-old body; an immutable
 * address — the commit the branch currently points at — is what makes a
 * download cache-safe and lets a caller skip one it already has.
 *
 * Upstream publishes no pointer file and no per-run stats sidecar: the only
 * statement of "what is current" is the branch itself. So this module asks
 * GitHub's API for the branch head and answers with its commit SHA (the
 * immutable ref every snapshot file is addressed through) and commit date
 * (the snapshot's publication time — the freshness identity the "unchanged"
 * short-circuit compares). The one API call is cache-busted for the same
 * reason the old `latest` pointer file was: a stale answer would pin the
 * whole download to yesterday's snapshot.
 */

/** The dataset repo publishing snapshots onto a rolling branch. */
export interface SnapshotSource {
  /** `owner/repo` of the snapshot repo. */
  repo: string;
  /** Rolling branch whose root holds the snapshot. */
  branch: string;
}

/** The branch head as GitHub's API reports it. */
interface RawBranchHead {
  sha?: unknown;
  commit?: {
    committer?: { date?: unknown };
  };
}

/** A resolved snapshot identity: what pins the download and what dates it. */
export interface SnapshotHead {
  /**
   * Commit SHA the branch points at; the immutable ref every snapshot file
   * is addressed through. Absent when only the weaker identity could be
   * resolved (the API did not answer) — the caller then falls back to the
   * mutable branch ref.
   */
  ref?: string;
  /**
   * The snapshot's freshness identity: the head commit's date (ISO, UTC)
   * when the API answered, or the index body's etag when only the branch
   * itself could be consulted. Equal values mean equal index bytes either
   * way — that is the only property the "unchanged" short-circuit relies on.
   */
  generatedAt: string;
}

/** A commit SHA is 40 (SHA-1) or 64 (SHA-256) hex characters. */
const SHA_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/**
 * Resolve the snapshot the repo's branch currently points at, via GitHub's
 * commits API (`/repos/{repo}/commits/{branch}` — CORS-enabled, no auth for
 * public repos, and a single small request per probe). Returns null when the
 * API did not answer with a usable branch head, which leaves the caller to
 * degrade to a weaker identity source.
 */
export async function readSnapshotHead(
  source: SnapshotSource,
): Promise<SnapshotHead | null> {
  const url = cacheBusted(
    `https://api.github.com/repos/${source.repo}/commits/${source.branch}`,
  );
  const head = await fetchFirstJson([url], (raw): SnapshotHead | null => {
    // A defensive shape check keeps an error page (or a future API shape)
    // from interpolating junk into download URLs: the SHA is interpolated
    // into every snapshot address the caller builds from it.
    if (typeof raw !== "object" || raw === null) return null;
    const { sha, commit } = raw as RawBranchHead;
    const generatedAt = commit?.committer?.date;
    if (typeof sha !== "string" || !SHA_PATTERN.test(sha)) return null;
    if (typeof generatedAt !== "string" || generatedAt.length === 0) {
      return null;
    }
    return { ref: sha, generatedAt };
  });
  return head;
}
