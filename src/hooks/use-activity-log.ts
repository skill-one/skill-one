import { useQuery } from "@tanstack/react-query";

import { readActivity } from "../lib/activity";

/**
 * The TanStack Query cache key for the activity viewer. The log is only ever
 * appended to or cleared, so every mutation path that matters either remounts
 * the viewer (a freshly opened dialog) or clears this key.
 */
export const ACTIVITY_QUERY_KEY = ["activity-log"] as const;

/**
 * The newest activity records, newest first.
 *
 * `staleTime: 0` on purpose: the shared default caches reads for ten minutes,
 * which for a log would hide the very actions the reader opened the viewer to
 * see. A log read is one small file, so re-reading on every mount is cheap.
 */
export function useActivityLog() {
  return useQuery({
    queryKey: ACTIVITY_QUERY_KEY,
    queryFn: () => readActivity(),
    staleTime: 0,
    refetchOnMount: "always",
  });
}
