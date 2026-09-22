import { useCallback, type MouseEvent } from "react";
import { useNavigate } from "react-router";

/**
 * The app's back control: the entry the reader came from when there is one, and
 * `fallback` when there is not.
 *
 * The two cases are different navigations, and the difference is the point of
 * this hook. Coming from a list, the entry behind this one *is* that list —
 * with its own scroll position, its own search and its own revealed depth, all
 * of which `useViewMemory` is holding on to — so getting there is a pop, and
 * the pop is what gives the reader their place back. Pushing a fresh copy of
 * the list instead would lose that place twice over: the fresh entry has no
 * memory of its own, and the page just visited is left behind the reader in the
 * stack, where the browser's own back button then walks into it.
 *
 * Arriving straight at a drill-down — a cold start on a deep link, or the menu
 * bar's popover — there is nothing of ours behind the entry, so the fallback
 * *replaces* it: the reader asked for one page and gets one page, rather than a
 * stack with a page they never asked for at its bottom.
 *
 * react-router keeps its own index inside the entry it writes
 * (`history.state.idx`), and index 0 is a window that has never navigated —
 * the one case with nothing to go back to.
 */
export function useReturn(fallback: string): {
  /** Where the control points, for the cases this hook does not handle. */
  to: string;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
} {
  const navigate = useNavigate();

  const onClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      // A modified click asks for another window, not for this one to move.
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      event.preventDefault();
      const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
      if (index > 0) navigate(-1);
      else navigate(fallback, { replace: true });
    },
    [fallback, navigate],
  );

  return { to: fallback, onClick };
}
