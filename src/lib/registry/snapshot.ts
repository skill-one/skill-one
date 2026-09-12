import { cacheBusted, fetchFirstText, fileCandidates } from "../cdn-config";

/**
 * Reading a snapshot repo's `latest` pointer — the one contract both upstream
 * dataset repos publish identically.
 *
 * `skill-one/skills-sh-mirror` (the skills index) and `skill-one/skills-profiles`
 * (the per-skill profiles) each publish a complete snapshot to a rolling branch
 * on a schedule, and write a `latest` file beside it: one line of plain text
 * holding the tag of the snapshot the branch currently points at. The tag is
 * what makes a download cache-safe — a tag-addressed URL is immutable, whereas
 * the branch is a mutable pointer an edge cache may answer with a day-old copy.
 *
 * So version resolution is a two-step read, and this module owns the first step
 * for every dataset: read `latest`, then address everything through the tag it
 * names. Upstream states the tag outright, so nothing here derives or sorts tag
 * names — the pointer is the authority.
 */

/** A dataset repo publishing snapshots behind a `latest` pointer file. */
export interface SnapshotSource {
  /** `owner/repo` of the snapshot repo. */
  repo: string;
  /** Rolling branch whose root holds both the snapshot and its pointer. */
  branch: string;
  /**
   * The tag shape this repo publishes. The pointer is trusted only when its
   * body matches: the value is interpolated into download URLs, so a junk ref
   * must never build a bogus address.
   */
  tag: RegExp;
}

/** The pointer file, at the root of every snapshot branch. */
const POINTER_PATH = "latest";

/**
 * Resolve the tag the repo's snapshot branch currently points at, by reading
 * its `latest` pointer. Returns null when no candidate served a usable tag,
 * which leaves the caller to fall back to the mutable branch itself.
 *
 * Every candidate request carries a cache-busting stamp: the pointer exists to
 * report freshness, so an edge copy answering with yesterday's tag would pin
 * the whole download to yesterday's snapshot.
 */
export async function readLatestTag(
  cdnBase: string,
  source: SnapshotSource,
): Promise<string | null> {
  try {
    const urls = fileCandidates(
      { repo: source.repo, ref: source.branch, path: POINTER_PATH },
      cdnBase,
    ).map(cacheBusted);
    const { text } = await fetchFirstText(urls);
    // The pointer is one line; trim the trailing newline and reject anything
    // that is not a tag this repo publishes (an error page served with 200,
    // a ref from a future format, ...).
    const tag = text.trim();
    return source.tag.test(tag) ? tag : null;
  } catch {
    // No candidate answered: the caller degrades to the branch.
    return null;
  }
}
