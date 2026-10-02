import { useEffect } from "react";
import { useNavigate } from "react-router";

import { focusSearchField, requestSearchField } from "../lib/search-shortcut";

/**
 * Cmd/Ctrl+K, the app-wide way into a list search. The field itself is a control
 * of a list and stands on that list's row (see `ListToolbar`), so the shortcut is
 * answered from the shell rather than from the field: on the two lists it focuses
 * the field under the reader's hands, and on the agents graph — a picture, not a
 * list — it carries the reader into the store's list, where the field focuses
 * itself as it mounts (see `lib/search-shortcut`). One shortcut, one meaning, on
 * every route, which is what keeps a field that moved out of the header from
 * being a shortcut into nothing.
 *
 * Mounted once, inside the router: the shortcut is about where a keystroke goes,
 * and only the router knows where the reader is.
 */
export function useSearchShortcut(): void {
  const navigate = useNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "k") return;
      // Whatever the browser would do with the shortcut — the address bar, in a
      // browser build — is never what was meant inside an app window.
      event.preventDefault();
      if (focusSearchField()) return;
      // A route with no list leaves the request waiting for the field that is
      // about to mount, so the reader lands in the field rather than beside it.
      requestSearchField();
      void navigate("/explore");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);
}
