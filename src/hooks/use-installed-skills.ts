import { useQuery, type QueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";

import { isTauri } from "../lib/tauri";
import { SKILLS_CHANGED_EVENT } from "../popover/popover-events";
import { fetchInstalledSkills } from "../lib/local-skills";
import type { InstalledSkill } from "../lib/skills-manager";

/**
 * The TanStack Query cache-key prefix for the installed-skill list. Every
 * consumer writes (install / remove / toggle) and invalidates this key —
 * so one `invalidateQueries({ queryKey: INSTALLED_SKILLS_QUERY_KEY })`
 * refreshes the list and the sidebar / popover counts at once.
 */
export const INSTALLED_SKILLS_QUERY_KEY = ["installed-skills"] as const;

/**
 * The TanStack Query cache-key prefix for the provenance state (see
 * `use-skill-provenance.ts`). Defined here — next to the installed list it
 * is invalidated alongside — so the provenance hook can read the installed
 * list without a circular import.
 */
export const PROVENANCE_QUERY_KEY = ["skill-provenance", "v3"] as const;

/**
 * The installed-skills list for the global skills directory. Shared by the
 * installed page, the sidebar badge, the install buttons, and the popover —
 * they all read the same cache entry via the shared key.
 */
export function useInstalledSkills() {
  // v5 already names these isLoading (=== isPending), isError and error, so
  // there is nothing to translate; the wrapper exists to own the shared key.
  return useQuery({
    queryKey: INSTALLED_SKILLS_QUERY_KEY,
    queryFn: fetchInstalledSkills,
  });
}

/**
 * What the installed list is asked over and over: the names on disk, and the
 * signature the ledger query is keyed by. Both are facts about *this* list and
 * nothing else, so both are derived from it once.
 *
 * A list of skills is drawn as hundreds of install buttons, each of which has
 * to know whether its own skill is already on disk — and every one of those
 * answers comes out of the same array. Folding the derivation into each button's
 * render would sort and join the list hundreds of times over; deriving it per
 * list instead costs one pass, and the cache lives exactly as long as the list
 * it was derived from, since an unchanged reference is an unchanged answer.
 */
interface InstalledFacts {
  source: readonly InstalledSkill[] | undefined;
  /** Every installed name, for the one-lookup question "is this one of them?". */
  names: ReadonlySet<string>;
  /** The ledger query key's tail: what the ledger can answer for at all. */
  signature: string | undefined;
}

/** The facts of an empty list — a button asks before the list has landed. */
const NO_FACTS: InstalledFacts = {
  source: undefined,
  names: new Set<string>(),
  signature: undefined,
};

let facts: InstalledFacts | undefined;

function factsOf(installed: readonly InstalledSkill[] | undefined): InstalledFacts {
  if (!installed) return NO_FACTS;
  if (facts?.source === installed) return facts;
  const names = new Set(installed.map((skill) => skill.name));
  return (facts = {
    source: installed,
    names,
    // The ledger is keyed by name, so the *set* of names is the whole of what it
    // can answer for — a same-name install from elsewhere asks it the same
    // question, and only the epoch tells that apart (see `useSkillProvenance`).
    signature: [...names].toSorted().join("\u0000"),
  });
}

/**
 * The names of the skills on disk, as one set for the whole list. The answer to
 * "is this skill installed?" is then a lookup rather than a scan — which is the
 * difference between a row that costs nothing and a page of rows that costs a
 * scan each, every time anything anywhere re-renders.
 */
export function useInstalledSkillNames(): ReadonlySet<string> {
  return factsOf(useInstalledSkills().data).names;
}

/**
 * The installed list's signature, for the ledger query key. See `factsOf`: it is
 * the list's own fact, so it is computed once per list rather than once per
 * reader of it.
 */
export function installedSignature(
  installed: readonly InstalledSkill[] | undefined,
): string | undefined {
  return factsOf(installed).signature;
}

/**
 * Broadcast that the installed-skills list changed to every other window.
 * Each window keeps its own query cache (the popover is a separate webview),
 * so invalidating only the local cache never reaches them. A no-op outside
 * Tauri so the browser / test environment stays silent.
 */
export function notifySkillsChanged(): void {
  if (isTauri()) void emit(SKILLS_CHANGED_EVENT);
}

/**
 * The single call every successful skill mutation should make: refresh this
 * window's cached list (and the provenance map, which changes with it) and
 * notify the other windows. Returns the invalidation promise so mutation
 * success handlers can `await` it.
 */
export function markSkillsChanged(
  queryClient: QueryClient,
): Promise<void> {
  const invalidated = Promise.all([
    queryClient.invalidateQueries({
      queryKey: INSTALLED_SKILLS_QUERY_KEY,
    }),
    queryClient.invalidateQueries({ queryKey: PROVENANCE_QUERY_KEY }),
  ]).then(() => undefined);
  notifySkillsChanged();
  return invalidated;
}
