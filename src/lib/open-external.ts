import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { isTauri } from "./tauri";

/**
 * Open an external URL in the system browser. Inside the Tauri WebView this
 * delegates to the opener plugin (plain `target="_blank"` anchors are silently
 * dropped by Tauri v2); in a plain browser it falls back to a new tab.
 */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Open a directory's contents in the system file manager. Tauri-only: showing
 * a raw filesystem path has no meaning in a plain browser, so it no-ops there.
 *
 * Delegates to the `open_directory` command rather than the opener plugin's
 * `openPath`, whose ACL scope cannot be declared for the (dynamic) agent
 * skills dirs ahead of time.
 */
export async function openPathInSystem(path: string): Promise<void> {
  if (isTauri()) {
    await invoke("open_directory", { path });
  }
}
