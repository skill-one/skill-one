import { QueryClient } from "@tanstack/react-query";

/**
 * The QueryClient factory each window builds its own client from — main app and
 * menu bar popover.
 *
 * *One factory, one client per window, deliberately not a shared singleton*: the
 * popover is a separate webview with its own JS context, so a module-level
 * singleton would hand each window a different instance anyway while claiming
 * they were the same. What actually crosses the window boundary is the installed
 * list, and it does so as an event — writes broadcast `SKILLS_CHANGED_EVENT`
 * (`hooks/use-installed-skills.ts`) and the popover invalidates on it plus on
 * focus (`popover/use-skills-live-sync.ts`).
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
