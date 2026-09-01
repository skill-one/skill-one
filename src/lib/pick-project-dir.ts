import { isTauri } from "./tauri";

/**
 * Open the native folder picker to choose a project directory.
 *
 * Uses `@tauri-apps/plugin-dialog`'s `open` in the desktop shell, imported
 * lazily so the browser build / tests never touch the native plugin. Returns the
 * chosen absolute path, or `null` when the user cancels. In a plain browser
 * (no Tauri) it also returns `null` — the caller then falls back to a manual
 * path input, so the flow stays explorable without the native side.
 */
export async function pickProjectDir(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selection = await open({
    directory: true,
    multiple: false,
    title: "选择项目目录",
  });
  return typeof selection === "string" && selection.length > 0
    ? selection
    : null;
}
