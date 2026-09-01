/**
 * Event contract between the menu bar popover window and the main window.
 * The popover emits {@link POPOVER_NAVIGATE_EVENT} with a `{ path }` payload:
 * Rust shows + focuses the main window, and the main window's listener
 * performs the routing.
 */

/** Event the popover emits to open a page in the main window. */
export const POPOVER_NAVIGATE_EVENT = "popover-navigate";

/** The my-skills page the popover's footer button opens. */
export const MY_SKILLS_PATH = "/my-skills";

/**
 * Deep link into the my-skills page with the search box pre-filled with
 * `name`, so the clicked skill is the one item in the filtered list.
 */
export function skillPath(name: string): string {
  return `${MY_SKILLS_PATH}?skill=${encodeURIComponent(name)}`;
}
