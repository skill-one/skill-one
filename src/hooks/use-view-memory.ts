import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useLocation } from "react-router";

import { readViewMemory, writeViewMemory } from "../lib/view-memory";

/**
 * A list page's view, kept across a drill-down: the controls over it, how much
 * of it has been revealed, and where it was scrolled to.
 *
 * `useState`-shaped on purpose — the page holds one `view` object rather than a
 * handful of loose states — because the object is what has to come back
 * together. Restoring the search without the depth it was revealed to, or the
 * depth without the scroll position, would put the reader somewhere they never
 * were, which is the complaint this exists to answer.
 *
 * The remembered view is read during the first render, so the first paint is
 * already the reader's own page rather than a reset one that catches up. The
 * scroll position is applied in a layout effect — before that paint, and only
 * once the list has content, because a position restored into a skeleton is a
 * position spent on nothing.
 *
 * @param name     the page's own name, so two pages can never share a memory
 * @param initial  what the view is the first time a reader arrives
 * @param scroller the page's own scrolling element, whose position is part of
 *                 the view
 * @param ready    whether the list has content to scroll yet
 */
export function useViewMemory<V>(
  name: string,
  initial: V,
  scroller: RefObject<HTMLElement | null>,
  { ready }: { ready: boolean },
): [V, (update: (view: V) => V) => void] {
  // The entry, not the path: see `lib/view-memory`.
  const key = `${name}:${useLocation().key}`;

  const [view, setView] = useState<V>(
    () => readViewMemory<V>(key)?.view ?? initial,
  );

  // The page's own view as the scroll listener below needs to see it — that
  // listener is registered once, and must not read a stale view out of
  // whatever render registered it.
  const current = useRef(view);
  useEffect(() => {
    current.current = view;
  }, [view]);

  // Where the scroller sits. A ref, not state: scrolling re-renders nothing,
  // and this is only ever written into the memory or read back for a restore.
  const scrolledTo = useRef(readViewMemory<V>(key)?.scrollTop ?? 0);

  // Put the reader back, in the layout pass: after the list has content, and
  // before anything is painted, so the restore is never seen happening.
  const restored = useRef(false);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (restored.current || !ready || !element) return;
    restored.current = true;
    const { scrollTop } = readViewMemory<V>(key) ?? { scrollTop: 0 };
    if (!scrollTop) return;
    element.scrollTo({ top: scrollTop, behavior: "instant" });
    scrolledTo.current = scrollTop;
  }, [key, ready, scroller]);

  // The controls and the reveal depth change with a render, so they are
  // remembered with one.
  useEffect(() => {
    writeViewMemory(key, { view, scrollTop: scrolledTo.current });
  }, [key, view]);

  // The scroll position changes without one, so it is remembered as it moves.
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const onScroll = () => {
      scrolledTo.current = element.scrollTop;
      writeViewMemory(key, {
        view: current.current,
        scrollTop: element.scrollTop,
      });
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [key, scroller]);

  return [view, setView];
}
