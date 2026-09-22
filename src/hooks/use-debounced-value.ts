import { useEffect, useState } from "react";

/** How long keystrokes settle before a search takes effect — one rhythm for
 * every searchable list (the store's worker query and the installed filter). */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * Keep a value one `delayMs` behind the input: keystrokes stay instant while
 * the (debounced) search query only reaches the worker once typing settles.
 * Shared by the explore page's search box.
 */
export function useDebouncedValue<T>(
  value: T,
  delayMs = SEARCH_DEBOUNCE_MS,
): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
