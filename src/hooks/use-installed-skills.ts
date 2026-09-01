import { useQuery, type QueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";

import { isTauri } from "../lib/tauri";
import { SKILLS_CHANGED_EVENT } from "../popover/popover-events";
import { fetchInstalledSkills } from "../lib/local-skills";

/**
 * The TanStack Query cache key for the installed-skills list. Invalidate by
 * this constant after installs / removals / toggles; the sidebar, popover,
 * my-skills page and skill cards all read the same entry, and React Query
 * dedupes concurrent requests for the shared key.
 */
export const INSTALLED_SKILLS_QUERY_KEY = ["installed-skills"] as const;

/**
 * The installed-skills query shared by every consumer of the local skill list
 * (see `INSTALLED_SKILLS_QUERY_KEY` for the invalidation contract).
 */
export function useInstalledSkills() {
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
 * window's cached list and notify the other windows. Returns the invalidation
 * promise so mutation success handlers can `await` it.
 */
export function markSkillsChanged(
  queryClient: QueryClient,
): Promise<void> {
  const invalidated = queryClient.invalidateQueries({
    queryKey: INSTALLED_SKILLS_QUERY_KEY,
  });
  notifySkillsChanged();
  return invalidated;
}
