import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { INSTALLED_SKILLS_QUERY_KEY } from "../hooks/use-installed-skills";
import { isTauri } from "../lib/tauri";
import { SKILLS_CHANGED_EVENT } from "./popover-events";

/**
 * Keeps the popover's independent query cache in sync with the rest of the
 * app. The popover is its own webview with its own QueryClient, so the main
 * window invalidating its cache never reaches it. Two complementary triggers:
 *
 * - Live: the main window broadcasts {@link SKILLS_CHANGED_EVENT} after any
 *   enable / disable / install / remove, so the list updates even while the
 *   popover is on screen.
 * - On show: re-focusing the popover forces a refetch, so every menu bar
 *   open paints the latest enabled skills even if a broadcast was missed
 *   while the webview sat hidden (Tauri may throttle a hidden window).
 *
 * Both just invalidate the shared installed-skills key: React Query then
 * refetches the active observer regardless of the 10-minute `staleTime`.
 */
export function useSkillsLiveSync(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isTauri()) return;

    const refresh = () =>
      void queryClient.invalidateQueries({
        queryKey: INSTALLED_SKILLS_QUERY_KEY,
      });

    const changed = listen(SKILLS_CHANGED_EVENT, refresh);
    const focused = getCurrentWindow().onFocusChanged(({ payload }) => {
      if (payload) refresh();
    });

    return () => {
      void changed.then((unlisten) => unlisten());
      void focused.then((unlisten) => unlisten());
    };
  }, [queryClient]);
}
