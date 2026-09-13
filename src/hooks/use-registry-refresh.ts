import { toast } from "sonner";

import { checkForRegistryUpdate } from "../lib/registry/refresh";

import { useScheduledCheck } from "./use-scheduled-check";

/**
 * Keep a long-running session current without ever asking the user to act.
 * Boot already probes once (see `initRegistry` in `main.tsx`); this re-runs
 * the same check when the last one has gone stale — on the shared hourly tick
 * and visibility wake (see `useScheduledCheck`).
 *
 * The user is never asked to do anything: a refresh swaps the served snapshot
 * in place without blanking the UI, and a failure is invisible too (the next
 * tick retries, and download errors reach the UI through the registry error
 * state instead). The one thing that is said out loud is a refresh that
 * actually landed — the list changing underfoot should not look like a glitch.
 */
export function useRegistryRefresh() {
  useScheduledCheck(() => {
    void checkForRegistryUpdate()
      .then((result) => {
        if (result?.status === "updated") {
          toast("技能数据已更新到最新快照");
        }
      })
      .catch(() => {
        // Deliberately swallowed: see the note above.
      });
  });
}
