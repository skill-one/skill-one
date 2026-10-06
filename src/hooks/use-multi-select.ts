import { useCallback, useEffect, useMemo, useState } from "react";

export interface UseMultiSelectOptions {
  /**
   * If true, pressing Escape while in selection mode will clear the selection.
   * Defaults to true.
   */
  escapeToClear?: boolean;
}

export interface UseMultiSelectReturn<T extends string = string> {
  selectedKeys: Set<T>;
  selectedList: T[];
  count: number;
  isSelectionMode: boolean;
  isSelected: (key: T) => boolean;
  toggle: (key: T) => void;
  select: (key: T) => void;
  unselect: (key: T) => void;
  selectBatch: (keys: T[]) => void;
  unselectBatch: (keys: T[]) => void;
  selectAll: (keys: T[]) => void;
  clear: () => void;
}

/**
 * A lightweight multi-selection hook powered by a Set<string>.
 * Automatically enters selection mode when at least one item is selected.
 */
export function useMultiSelect<T extends string = string>(
  options: UseMultiSelectOptions = {},
): UseMultiSelectReturn<T> {
  const { escapeToClear = true } = options;
  const [selectedKeys, setSelectedKeys] = useState<Set<T>>(() => new Set<T>());

  const isSelectionMode = selectedKeys.size > 0;
  const count = selectedKeys.size;

  const isSelected = useCallback(
    (key: T) => selectedKeys.has(key),
    [selectedKeys],
  );

  const toggle = useCallback((key: T) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const select = useCallback((key: T) => {
    setSelectedKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const unselect = useCallback((key: T) => {
    setSelectedKeys((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const selectBatch = useCallback((keys: T[]) => {
    setSelectedKeys((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const k of keys) {
        if (!next.has(k)) {
          next.add(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const unselectBatch = useCallback((keys: T[]) => {
    setSelectedKeys((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const k of keys) {
        if (next.has(k)) {
          next.delete(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const selectAll = useCallback((keys: T[]) => {
    setSelectedKeys((prev) => {
      if (prev.size === keys.length && keys.every((k) => prev.has(k))) {
        return prev;
      }
      return new Set(keys);
    });
  }, []);

  const clear = useCallback(() => {
    setSelectedKeys((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  useEffect(() => {
    if (!escapeToClear || !isSelectionMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clear();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [escapeToClear, isSelectionMode, clear]);

  const selectedList = useMemo(() => Array.from(selectedKeys), [selectedKeys]);

  return useMemo(
    () => ({
      selectedKeys,
      selectedList,
      count,
      isSelectionMode,
      isSelected,
      toggle,
      select,
      unselect,
      selectBatch,
      unselectBatch,
      selectAll,
      clear,
    }),
    [
      selectedKeys,
      selectedList,
      count,
      isSelectionMode,
      isSelected,
      toggle,
      select,
      unselect,
      selectBatch,
      unselectBatch,
      selectAll,
      clear,
    ],
  );
}
