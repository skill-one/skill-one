/**
 * The app's persisted state in `window.localStorage`: the download source, the
 * snapshot tag the served index was built at, the agent link exclusions, the
 * provenance ledger's browser stand-in, and React Query's cache journal.
 *
 * Every access is guarded, because the WebView's quota (~5–10 MB) is a hard
 * limit and storage can be disabled outright: a write that fails must not take
 * a settings change — or the app — down, and a read of a blocked or unset key
 * answers `null`, the same as "never stored". Nothing keeps an in-memory copy
 * on top: the one environment here without a `localStorage` at all is the
 * registry worker, which by design is handed its download source by the main
 * thread rather than reading it (see `lib/registry/client`).
 *
 * Accessing `window.localStorage` lazily, inside the methods, also keeps
 * merely wiring a module up from touching the getter — Node's experimental
 * global `localStorage` warns when read.
 */
export const storage = {
  getItem(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Out of quota or storage disabled: the write is dropped, which costs
      // persistence and nothing else — never a thrown error at the caller.
    }
  },
  removeItem(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing to remove if storage is unavailable.
    }
  },
};
