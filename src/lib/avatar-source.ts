import { fileCandidates, getIndexTag } from "./cdn-config";

/**
 * Where an owner's avatar comes from — one answer, for the two things that need
 * it: the image a card draws, and the same image sampled for its colour (see
 * `lib/owner-tint.ts`). They have to agree, or a card would be tinted by an
 * avatar it is not showing.
 */

/**
 * The dataset repo hosts every owner's avatar as a regular repo file (copied
 * from GitHub at snapshot time), so avatars ride the same download source and
 * CDN fallback chain as SKILL.md and the index — `upstream/avatars/{owner}.png`
 * at the recorded snapshot tag (immutable, cache-safe), the mutable `dist`
 * branch before any tag has been recorded. GitHub's own avatar endpoint stays
 * at the end of the chain as a fallback for owners whose copy the dataset
 * missed (a failed download run leaves a hole until the next one).
 */
const MIRROR_REPO = "skill-one/skills-profiles";

/** Every URL an owner's avatar may be read from, most authoritative first. */
export function avatarCandidates(owner: string): string[] {
  const spec = {
    repo: MIRROR_REPO,
    path: `upstream/avatars/${encodeURIComponent(owner)}.png`,
    ref: getIndexTag() || "dist",
  };
  return [...fileCandidates(spec), `https://github.com/${owner}.png`];
}
