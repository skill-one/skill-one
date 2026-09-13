import { useQuery, type QueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";

import { isTauri } from "../lib/tauri";
import { SKILLS_CHANGED_EVENT } from "../popover/popover-events";
import { fetchInstalledSkills } from "../lib/local-skills";

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
export const PROVENANCE_QUERY_KEY = ["skill-provenance", "v2"] as const;

/**
 * The installed-skills list for the global skills directory. Shared by the
 * my-skills page, the sidebar badge, the install buttons, and the popover —
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
