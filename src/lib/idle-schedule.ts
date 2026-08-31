/**
 * Idle-time scheduling for work that must not delay rendering.
 *
 * Building the skill search index costs hundreds of milliseconds, so it is
 * chopped into short slices handed out one at a time while the main thread is
 * otherwise free. This module owns the "when is the main thread free" question
 * so the builder can stay a plain loop.
 */

/**
 * Schedules `task` to run once the browser is idle, returning a function that
 * stops a still-pending task from running (a no-op once it has run).
 */
export type IdleSchedule = (task: () => void) => () => void;

/**
 * Upper bound on how long `requestIdleCallback` may keep postponing the task.
 * Without it a page that never goes idle (continuous animation, a busy
 * download) could starve the build indefinitely; with it the build finishes
 * even on a permanently busy page, at the cost of some jank.
 */
const IDLE_TIMEOUT_MS = 500;

/**
 * Default scheduler: prefer `requestIdleCallback`, fall back to a plain timer.
 * The fallback matters for the older WebKit builds the app still targets (the
 * same reason `skills-api` avoids `TextDecoderStream`).
 */
export const scheduleIdle: IdleSchedule = (task) => {
  if (typeof globalThis.requestIdleCallback === "function") {
    const handle = globalThis.requestIdleCallback(() => task(), {
      timeout: IDLE_TIMEOUT_MS,
    });
    return () => globalThis.cancelIdleCallback(handle);
  }
  const handle = setTimeout(task, 0);
  return () => clearTimeout(handle);
};
