import { useEffect, useRef, useState } from "react";

/**
 * Progressive reveal for a list with no pagination: mount the first `initial`
 * items with the page, then extend the run by `step` each time the sentinel the
 * caller mounts at the list's end scrolls into view. When the run already
 * covers `total` the sentinel is gone and a late trigger is a no-op.
 *
 * The observer is rebuilt on every extension (its deps include the count), so a
 * sentinel still sitting in view keeps revealing the next chunk without a
 * further scroll — a tall viewport fills itself until the list is fully
 * mounted. `setCount` is functional, so a burst of callbacks lands on the
 * latest count rather than a stale one.
 *
 * `resetKey` re-seeds the count to `initial`: a page that stays mounted across
 * two answers — a repository's page walking from one repo to the next — starts
 * each answer revealed to the same depth, never to whatever the previous one
 * had reached.
 */
export function useProgressiveReveal({
  total,
  initial,
  step,
  resetKey,
}: {
  /** How many items the list holds; the run never grows past it. */
  total: number;
  /** How many items mount with the page. */
  initial: number;
  /** How many more items each scroll-into-view reveals. */
  step: number;
  /** Identity of the answer; a change re-seeds the run to `initial`. */
  resetKey?: unknown;
}) {
  const [count, setCount] = useState(initial);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const done = count >= total;

  // A new answer starts over at the initial depth.
  useEffect(() => {
    setCount(initial);
  }, [initial, resetKey]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || done) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setCount((c) => Math.min(c + step, total));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [count, done, step, total]);

  return { count, sentinelRef, done };
}
