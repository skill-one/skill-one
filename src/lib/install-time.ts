/**
 * Ordering by install time for the installed list.
 *
 * Every installed skill carries when its directory landed on disk
 * (`SkillView.installedAt`, Unix seconds). The lists order by that stamp:
 * the skill unit sorts the installs themselves, the repository unit sorts
 * each repository by the newest install it contains.
 */

/**
 * Newest-first comparator over anything carrying an install timestamp.
 *
 * Time is the whole of the ordering: a newer timestamp always wins, and an
 * item with no timestamp cannot claim any position the filesystem proves, so
 * it settles last. Equal stamps defer to `tieBreak` (a name, a key) so ties
 * stay deterministic without the tie-break ever outranking time.
 */
export function compareByInstalledTime<T>(
  timeOf: (item: T) => number | null | undefined,
  tieBreak: (a: T, b: T) => number = () => 0,
): (a: T, b: T) => number {
  return (a, b) => {
    const ta = timeOf(a);
    const tb = timeOf(b);
    if (ta == null && tb == null) return tieBreak(a, b);
    if (ta == null) return 1;
    if (tb == null) return -1;
    if (tb !== ta) return tb - ta;
    return tieBreak(a, b);
  };
}

/**
 * The newest timestamp among `items` (Unix seconds), or `null` when none of
 * them carries one — the timestamp a repository orders by.
 */
export function newestInstallTime<T>(
  items: readonly T[],
  timeOf: (item: T) => number | null | undefined,
): number | null {
  let newest: number | null = null;
  for (const item of items) {
    const t = timeOf(item);
    if (t == null) continue;
    if (newest == null || t > newest) newest = t;
  }
  return newest;
}
