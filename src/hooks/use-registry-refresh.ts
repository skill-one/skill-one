import { useEffect } from "react";
import { toast } from "sonner";

import { checkForRegistryUpdate } from "../lib/registry/refresh";

/**
 * How often the freshness window is consulted. The check itself is a no-op
 * unless the window has passed, so this only bounds how late a due check can
 * run — an hour is well inside "the user cannot tell".
 */
const TICK_MS = 60 * 60 * 1000;

/**
 * Keep a long-running session current without ever asking the user to act.
 * Boot already probes once (see `initRegistry` in `main.tsx`); this re-runs
 * the same check when the last one has gone stale — on an hourly tick, and
 * when the window becomes visible again after a sleep that may have swallowed
 * ticks.
 *
 * The user is never asked to do anything: a refresh swaps the served snapshot
 * in place without blanking the UI, and a failure is invisible too (the next
 * tick retries, and download errors reach the UI through the registry error
 * state instead). The one thing that is said out loud is a refresh that
 * actually landed — the list changing underfoot should not look like a glitch.
 */
export function useRegistryRefresh() {
  useEffect(() => {
    const check = () => {
      void checkForRegistryUpdate()
        .then((result) => {
          if (result?.status === "updated") {
            toast("技能数据已更新到最新快照");
          }
        })
        .catch(() => {
          // Deliberately swallowed: see the note above.
        });
    };
    const timer = window.setInterval(check, TICK_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
}
