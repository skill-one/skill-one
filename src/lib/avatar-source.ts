import { fileCandidates, getIndexRef } from "./cdn-config";

/**
 * Where an owner's avatar comes from: one answer, in one place, for the image
 * every surface draws.
 */

/**
 * The dataset repo hosts every owner's avatar as a regular repo file (copied
 * from GitHub at snapshot time), so avatars ride the same download source and
 * CDN fallback chain as SKILL.md and the index — `owners/{owner}.png` at the
 * recorded snapshot ref (immutable, cache-safe), the mutable `dist` branch
 * before any ref has been recorded. GitHub's own avatar endpoint stays at the
 * end of the chain as a fallback for owners whose copy the dataset missed (a
 * failed download run leaves a hole until the next one).
 */
const MIRROR_REPO = "skill-one/skills-profiles";

/** Every URL an owner's avatar may be read from, most authoritative first. */
export function avatarCandidates(owner: string): string[] {
  const spec = {
    repo: MIRROR_REPO,
    path: `owners/${encodeURIComponent(owner)}.png`,
    ref: getIndexRef() || "dist",
  };
  return [...fileCandidates(spec), `https://github.com/${owner}.png`];
}
