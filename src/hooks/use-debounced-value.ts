import { useEffect, useState } from "react";

/**
 * Keep a value one `delayMs` behind the input: keystrokes stay instant while
 * the (debounced) search query only reaches the worker once typing settles.
 * Shared by the explore and repos pages' search boxes.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
