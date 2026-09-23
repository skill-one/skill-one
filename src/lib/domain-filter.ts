import { DOMAINS, UNCLASSIFIED_DOMAIN } from "../data/domains";

/**
 * The domain facet shared by every skill list that filters by classification —
 * the store's browse list and the installed list. Both file a skill the dataset
 * never classified the same way and order the resulting chips the same way, so
 * the two filter bars cannot disagree.
 */

/** The taxonomy's own order, for a stable tie-break between equal-sized chips. */
const TAXONOMY_RANK = new Map(
  DOMAINS.map((domain, index) => [domain.key, index]),
);

/**
 * A domain key's rank in the taxonomy; a key outside it — the unclassified
 * state, or one upstream renamed — sorts after every real domain.
 */
export function taxonomyRank(key: string): number {
  return TAXONOMY_RANK.get(key) ?? DOMAINS.length;
}

/**
 * A skill's classification keys, for the facet and the filter both. A skill
 * nothing classified reports {@link UNCLASSIFIED_DOMAIN} — never 其他, which is
 * the *other* state: the dataset looked and answered "none of the above fit".
 * Merging them would make the filter unable to tell an answer from a blank, so
 * the two keep a chip each.
 */
export function domainsOf(skill: { profile?: { domain?: string[] } }): string[] {
  const domain = skill.profile?.domain;
  return domain && domain.length > 0 ? domain : [UNCLASSIFIED_DOMAIN];
}

/** One domain the list holds, and how many of its items belong to it. */
export interface DomainFacet {
  key: string;
  count: number;
}

/**
 * The domain chips a list produces, biggest first, ties broken by the
 * taxonomy's own order: every domain that holds at least one item, and nothing
 * for the domains it does not. `domainsOfItem` reads an item's classification
 * keys — an unclassified item must report the unclassified key, not an empty
 * list.
 */
export function domainFacets<T>(
  items: T[],
  domainsOfItem: (item: T) => string[],
): DomainFacet[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const key of domainsOfItem(item)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts, ([key, count]) => ({ key, count })).toSorted(
    (a, b) =>
      b.count - a.count || taxonomyRank(a.key) - taxonomyRank(b.key),
  );
}
