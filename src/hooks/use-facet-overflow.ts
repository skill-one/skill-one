import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  type RefObject,
} from "react";

import { facetFitCount } from "../lib/facet-overflow";

/** The gap the facet row puts between two neighbours, in px. */
export const FACET_GAP = 6;

/**
 * How many facet chips fit on the row, measured rather than guessed.
 *
 * The widths come from a second, invisible copy of the row that always holds
 * every chip: measuring the line the reader sees would mean measuring a row that
 * has already dropped the chips in question, which is the kind of feedback loop
 * that oscillates between "fits" and "does not". The measuring line is
 * absolutely positioned and hidden, so it costs no layout and nothing about it
 * reaches assistive tech (see `ListFacets`).
 *
 * `visibleCount` is `null` while there is nothing to measure against — jsdom, or
 * a row that has not been laid out yet. Every chip is shown then: a filter
 * hidden behind a control whose own existence is in doubt is worse than a row
 * that overflows.
 */
export function useFacetOverflow(
  count: number,
  gap = FACET_GAP,
): {
  /** The line the reader sees; its width is the budget. */
  rowRef: RefObject<HTMLDivElement | null>;
  /** The hidden line holding every chip, for measuring. */
  measureRef: RefObject<HTMLDivElement | null>;
  /** The trailing control, whose width the line has to leave room for. */
  moreRef: RefObject<HTMLSpanElement | null>;
  /** How many chips fit, or `null` when the row could not be measured. */
  visibleCount: number | null;
} {
  const rowRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  // Bumped by the observer below, so a window resize re-measures.
  const [revision, reMeasure] = useReducer((n: number) => n + 1, 0);

  useLayoutEffect(() => {
    const row = rowRef.current;
    const line = measureRef.current;
    if (!row || !line) return;

    const available = row.clientWidth;
    const widths = [...line.children].map(
      (child) => (child as HTMLElement).offsetWidth,
    );
    if (available <= 0 || widths.length === 0) {
      setVisibleCount(null);
      return;
    }

    const next = facetFitCount({
      widths,
      available,
      // The trailing control is not on the line yet on the first pass (nothing
      // is hidden until this decides), which is why the effect re-runs once the
      // count lands: the second pass reserves its real width.
      trailing: moreRef.current?.offsetWidth ?? 0,
      gap,
    });
    setVisibleCount((current) => (current === next ? current : next));
  }, [count, gap, revision, visibleCount]);

  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(reMeasure);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return { rowRef, measureRef, moreRef, visibleCount };
}
