import { getRegistrySnapshot, revalidateRegistry } from "./client";
import type { RevalidateResult } from "./protocol";

/**
 * Policy for the app's *silent* freshness checks. Boot already probes the
 * published snapshots on its own (see `initRegistry`); this module governs
 * the checks made while the app simply stays open, so a session that runs for
 * days keeps itself current without the user ever being asked to care.
 */

/**
 * How long a completed check stays good for. Both published sources roll over
 * once a day, so half a day keeps a long-running session within one publish
 * of current without polling for anything.
 */
export const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

/** The check currently in flight, so concurrent callers share one probe. */
let inFlight: Promise<RevalidateResult> | null = null;

/**
 * Check the published snapshots and pull in anything new — silently. Only the
 * freshness window and the in-flight guard are decided here; what actually
 * happens (probe, download, or nothing at all) is the worker's call.
 *
 * Resolves with null when the last check is still fresh and the worker was
 * never asked, so callers can tell "nothing to do" from a real outcome.
 *
 * `force` is for a user-initiated check (the Settings button), which must run
 * regardless of the window.
 */
export function checkForRegistryUpdate(options?: {
  force?: boolean;
}): Promise<RevalidateResult | null> {
  if (inFlight) return inFlight;
  if (!options?.force) {
    // A snapshot with no recorded check has never been confirmed against the
    // published one (the probe failed, or boot is still streaming), so it is
    // due rather than fresh — waiting a full window would strand it.
    const checkedAt = getRegistrySnapshot().index?.checkedAt;
    if (checkedAt !== undefined && Date.now() - checkedAt < STALE_AFTER_MS) {
      return Promise.resolve(null);
    }
  }
  inFlight = revalidateRegistry().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
