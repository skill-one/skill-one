import { useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchFullIndex,
  SKILLS_QUERY_KEY,
  subscribeIndexProgress,
  type SkillsIndexData,
} from "../lib/skills-api";

/**
 * Registry-index query shared by the explore and featured pages.
 *
 * The queryFn subscribes to the streaming download and mirrors every progress
 * snapshot into the cache as `{ skills, complete: false }`, so pages render
 * their first cards while the ~12MB index is still arriving. The promise's
 * resolved value lands as `{ skills, complete: true }` when the stream
 * finishes; consumers that need the whole registry (the MiniSearch index,
 * featured rankings) gate on that flag instead of acting on partial data.
 */
export function useSkillsIndex() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: SKILLS_QUERY_KEY,
    queryFn: async (): Promise<SkillsIndexData> => {
      const stopProgress = subscribeIndexProgress((skills) => {
        queryClient.setQueryData(SKILLS_QUERY_KEY, {
          skills,
          complete: false,
        } satisfies SkillsIndexData);
      });
      try {
        const skills = await fetchFullIndex();
        return { skills, complete: true };
      } finally {
        stopProgress();
      }
    },
  });
}
