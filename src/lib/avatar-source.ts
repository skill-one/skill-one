import { fileCandidates } from "./cdn-config";
import { MIRROR } from "./mirror";

/**
 * Where an owner's avatar comes from: one answer, in one place, for the image
 * every surface draws.
 */

/**
 * The dataset repo hosts every owner's avatar as a regular repo file (copied
 * from GitHub at snapshot time), so avatars ride the same download source and
 * CDN fallback chain as SKILL.md and the index — `owners/{owner}.png` on the
 * snapshot's `dist` branch. GitHub's own avatar endpoint stays at the end of
 * the chain as a fallback for owners whose copy the dataset missed (a failed
 * download run leaves a hole until the next one).
 */

/** Every URL an owner's avatar may be read from, most authoritative first. */
export function avatarCandidates(owner: string): string[] {
  const spec = {
    repo: MIRROR.repo,
    path: `owners/${encodeURIComponent(owner)}.png`,
    ref: MIRROR.ref,
  };
  return [...fileCandidates(spec), `https://github.com/${owner}.png`];
}
