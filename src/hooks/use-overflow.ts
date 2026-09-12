import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Whether a `line-clamp`-ed element still hides content below its box.
 *
 * `line-clamp` only clips visually: the full text stays in the DOM while the
 * box keeps the clamped height, so `scrollHeight > clientHeight` is exactly
 * the "there is more to read" signal. The check re-runs on every box resize
 * (window resize, drawer slide-in, a word re-wrapping) and once web fonts
 * land — a font swap can add a line at an unchanged clamped box height, which
 * no resize observer would report.
 *
 * While the element is expanded its box fits its content, so the hook reports
 * `false`. Callers that keep the expanded state should OR the two
 * (`overflowing || open`) to keep their collapse affordance on screen, and
 * re-measure for free when the box shrinks back to the clamped height.
 */
export function useOverflow<T extends HTMLElement>(content: string): {
  /** Attach to the clamped element. */
  ref: RefObject<T | null>;
  overflowing: boolean;
} {
  const ref = useRef<T>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // A sub-pixel rounding difference is not an overflow.
    const measure = () =>
      setOverflowing(
        content !== "" && element.scrollHeight > element.clientHeight + 1,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    // jsdom and older WebViews ship no FontFaceSet at all.
    const fonts = (document as { fonts?: FontFaceSet }).fonts;
    void fonts?.ready?.then(measure);
    return () => observer.disconnect();
  }, [content]);

  return { ref, overflowing };
}
