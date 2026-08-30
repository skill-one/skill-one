import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient factory for both windows (main app + menu bar popover).
 *
 * Cached registry data is served for 10 minutes without re-fetching
 * (`staleTime`); beyond that it is shown first and revalidated in the
 * background, and the UI updates to the fresh data when the request lands.
 * Retries are left to the UI's retry button so a network hiccup doesn't pile
 * up hidden requests.
 *
 * `gcTime: Infinity` disables garbage collection: cached pages stay in memory
 * forever, so every revisit paints from cache first and refreshes in the
 * background. Only a manual cache clear ever drops the data.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 10 * 60 * 1000,
        gcTime: Infinity,
        retry: false,
      },
    },
  });
}
