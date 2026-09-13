import { useEffect, useRef } from "react";

/**
 * How often the scheduled trigger below wakes up. The tick is not the check
 * interval — a throttle window inside each checker decides whether anything
 * actually happens. The hour only bounds how late a due check can run, which
 * is well inside "the user cannot tell".
 */
export const TICK_MS = 60 * 60 * 1000;

interface ScheduleOptions {
  /** Run the check once on mount, for checkers whose boot path does not probe. */
  immediate?: boolean;
  /** Gate the whole schedule off (e.g. browser builds with no app to update). */
  enabled?: boolean;
}

/**
 * The one scheduler both background checkers share: wake hourly, plus once
 * whenever the window becomes visible again — a sleep may have swallowed
 * ticks, and visibility is the one event that fires when it comes back.
 * Skipped ticks cost nothing: each checker throttles inside its own window.
 */
export function useScheduledCheck(
  check: () => void,
  { immediate = false, enabled = true }: ScheduleOptions = {},
): void {
  // A ref keeps a re-render from tearing down and re-arming the timers.
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    if (!enabled) return;
    if (immediate) checkRef.current();
    const timer = window.setInterval(() => checkRef.current(), TICK_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkRef.current();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, immediate]);
}
