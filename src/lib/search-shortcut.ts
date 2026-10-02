/**
 * Where Cmd/Ctrl+K lands. The search field is a control of a list, so it lives
 * on that list's own row beside the list's scope and order (see
 * `components/list-toolbar`) rather than in the window's chrome — but the
 * shortcut is an app-wide way into a search, so it is answered from the shell
 * (see `App`) and lands here.
 *
 * Two facts, both module-level because both outlive any one render: the field
 * on screen, and whether the reader has already asked for a field that is not
 * there. The second is what lets the shortcut mean the same thing on every
 * route — on the two lists it focuses the field, and on the rest it walks the
 * reader to the store's list, where the field focuses itself as it mounts.
 *
 * At most one field is ever mounted: the two lists are never on screen together,
 * each page rendering its own copy of the controls. That is the same reason
 * `lib/list-view` is module-level rather than a context.
 */

/** The field on screen, or null on a route that has no list. */
let mounted: HTMLInputElement | null = null;

/** A shortcut press that had no field to land on, waiting for one to mount. */
let asked = false;

/**
 * The field registers itself here as it mounts and hands back the null on the
 * way out — which is the honest answer on a route without a list: the shortcut
 * has nowhere to land until the reader reaches one.
 */
export function setSearchField(field: HTMLInputElement | null): void {
  mounted = field;
}

/**
 * Focus the field and select what is in it, so the keystroke typed next
 * replaces the question already asked with no backspacing. False when there is
 * no field, or when the one there is locked over a list that cannot answer yet —
 * a search must never be answered over a half-built index.
 */
export function focusSearchField(): boolean {
  if (!mounted || mounted.disabled) return false;
  mounted.focus();
  mounted.select();
  return true;
}

/** Note a shortcut press that no field answered. */
export function requestSearchField(): void {
  asked = true;
}

/** Take the waiting request, if there is one; asking consumes it. */
export function takeSearchRequest(): boolean {
  const waiting = asked;
  asked = false;
  return waiting;
}

/** Test hook: forget both facts, so one case cannot inherit another's. */
export function resetSearchShortcut(): void {
  mounted = null;
  asked = false;
}
