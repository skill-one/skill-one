import { useQuery } from "@tanstack/react-query";

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
