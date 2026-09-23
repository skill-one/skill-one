import type { Group } from "./protocol";

/**
 * Browse order for repository groups: most-starred first, then the biggest, then
 * by name — the figure a card's bar carries leads.
 *
 * Shared by the worker (which orders real repository groups) and the explore
 * page (which reorders the flattened domain sections into the single ranking the
 * bands are cut from), so the two can never disagree about what "top" means.
 */
export function byRepoRank(a: Group, b: Group): number {
  return (
    (b.stars ?? 0) - (a.stars ?? 0) ||
    b.skills.length - a.skills.length ||
    a.title.localeCompare(b.title)
  );
}
