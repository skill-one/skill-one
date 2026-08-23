/**
 * Detect whether the app is running inside a Tauri webview.
 * Used to toggle native-only affordances (e.g. traffic lights / drag region).
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
