/**
 * Event contract shared by the menu bar popover window and the main window.
 * Both directions ride the Tauri event bus so neither window has to reach
 * into the other:
 *
 * - popover → main: the popover emits {@link POPOVER_NAVIGATE_EVENT} with a
 *   `{ path }` payload; Rust shows + focuses the main window, and the main
 *   window's listener performs the routing.
 * - main → every window: after any enable / disable / install / remove, the
 *   main window emits {@link SKILLS_CHANGED_EVENT}; the popover (a separate
 *   webview with its own query cache) listens and refetches.
 */

/** Event the popover emits to open a page in the main window. */
export const POPOVER_NAVIGATE_EVENT = "popover-navigate";

/**
 * Broadcast whenever the installed-skills list changed. Emitted with no
 * payload from the window that performed the mutation (and force-refetched
 * on popover focus, see `useSkillsLiveSync`); every other window invalidates
 * its own `INSTALLED_SKILLS_QUERY_KEY` in response.
 */
export const SKILLS_CHANGED_EVENT = "skills-changed";

/** The my-skills page the popover's footer button opens. */
export const MY_SKILLS_PATH = "/my-skills";

/**
 * Deep link into the my-skills page with the search box pre-filled with
 * `name`, so the clicked skill is the one item in the filtered list.
 */
export function skillPath(name: string): string {
  return `${MY_SKILLS_PATH}?skill=${encodeURIComponent(name)}`;
}
