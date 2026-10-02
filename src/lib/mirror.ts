/**
 * The dataset this app reads. `skill-one/skills-profiles` publishes the
 * catalog, the repos sidecar, every indexed skill's `SKILL.md` and the owner
 * avatars as one snapshot, mirrored onto its `dist` branch.
 *
 * Everything fetched from it is addressed the same way: the mutable `dist`
 * branch, the only address the dataset publishes. Freshness is decided by an
 * etag probe over the branch body (see `registry/index-stream.ts`), and the
 * multi-megabyte index is fetched cache-busted so a stale edge copy can never
 * pass for the current snapshot.
 */
export const MIRROR = {
  repo: "skill-one/skills-profiles",
  /** The rolling branch the snapshot is published to. */
  ref: "dist",
} as const;
