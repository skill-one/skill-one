import { getIndexRef } from "./cdn-config";

/**
 * The dataset this app reads. `skill-one/skills-profiles` publishes the
 * catalog, the repos sidecar, every indexed skill's `SKILL.md` and the owner
 * avatars as one snapshot, mirrored onto its `dist` branch.
 *
 * Everything fetched from it is addressed the same way: pinned to the commit
 * SHA of the branch head being served, which is immutable so a lagging CDN
 * can only ever answer with the same bytes; or, before any ref has been
 * recorded, read off the mutable `dist` branch cache-busted, so a stale edge
 * copy can never pass for the current snapshot (see `snapshotUrls` in
 * `registry/index-stream.ts`).
 */
export const MIRROR = {
  repo: "skill-one/skills-profiles",
  /** Fallback ref while no snapshot SHA has been recorded. */
  ref: "dist",
} as const;

/** The ref a main-thread read is pinned to: the served snapshot's SHA, or `dist`. */
export function mirrorRef(): string {
  return getIndexRef() || MIRROR.ref;
}
