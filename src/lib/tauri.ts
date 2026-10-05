/**
 * Detect whether the app is running inside a Tauri webview.
 * Used to toggle native-only affordances (e.g. traffic lights / drag region).
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Detect whether the client platform is macOS.
 * Used for platform-specific affordances (e.g. traffic lights padding).
 */
export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // Modern standard navigator.userAgentData if available, with userAgent fallback
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = (navigator as any)?.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  return /mac/i.test(platform);
}

/**
 * Detect whether the client platform is Windows.
 */
export function isWindows(): boolean {
  if (typeof navigator === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = (navigator as any)?.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  return /win/i.test(platform);
}

/**
 * Detect whether the client platform is Linux.
 */
export function isLinux(): boolean {
  if (typeof navigator === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platform = (navigator as any)?.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  return /linux/i.test(platform);
}

