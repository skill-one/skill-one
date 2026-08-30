import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { isTauri } from "../lib/tauri";

/**
 * Mirror the app theme onto the native window so OS-drawn surfaces — title
 * bar, scrollbars, form controls, and the tray popover's vibrancy material —
 * follow the UI instead of staying light.
 *
 * `theme` is the user's *choice* (light | dark | system), not the resolved
 * value. `system` maps to Tauri's `null`, which hands "follow the system" to
 * the OS layer: that tracks appearance changes natively and is more reliable
 * than re-deriving `prefers-color-scheme` on the JS side. On macOS and Linux
 * the window theme is app-wide, so a single call covers every window.
 */
export function useNativeTheme(theme: string | undefined): void {
  useEffect(() => {
    if (!isTauri() || !theme) return;

    const native = theme === "system" ? null : theme === "dark" ? "dark" : "light";

    getCurrentWindow()
      .setTheme(native)
      .catch((error: unknown) =>
        console.error("failed to set native window theme:", error),
      );
  }, [theme]);
}
