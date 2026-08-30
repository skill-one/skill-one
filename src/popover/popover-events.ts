/**
 * Event contract between the menu bar popover window and the main window.
 * The popover emits {@link POPOVER_NAVIGATE_EVENT} with a `{ path }` payload:
 * Rust shows + focuses the main window, and the main window's listener
 * performs the routing.
 */

/** Event the popover emits to open a page in the main window. */
export const POPOVER_NAVIGATE_EVENT = "popover-navigate";

/** The store page route the popover's footer button jumps to. */
export const STORE_PATH = "/explore";
