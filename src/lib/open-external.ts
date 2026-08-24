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
