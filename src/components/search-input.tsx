import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { cn } from "../lib/utils";
import { Input } from "./ui/input";

/**
 * How long a word settles before the list is asked about it — one rhythm for
 * every searchable list, and the only place that decides where between the two
 * the line falls. The field answers as it is typed, the list on the settled
 * word (see `lib/list-view.ts`), and this is the whole of the difference
 * between them.
 */
const SETTLE_MS = 150;

/**
 * The list search field: a shadcn `Input` with a leading magnifier. `label`
 * names what is being searched and doubles as the accessible label, so the
 * visible hint and the announced one can never drift apart.
 *
 * It opens its list's own row, the one the scope and the order stand on (see
 * `ListToolbar`), and is open all the time: a field that has to be asked for
 * first is a field the reader has to look for first, and searching is the first
 * thing a reader does to a list of eight thousand. The magnifier is decorative
 * and never the click target — the field under it is.
 *
 * **The word being written is the field's own; the list hears only the settled
 * one.** The field therefore holds what has been typed and hands it up once the
 * keystrokes stop, rather than writing every character straight into the shared
 * view. That is not a nicety: a list is hundreds of rows, each reading shared
 * state, so a per-character write re-renders the whole answer per character —
 * the exact cost a search box exists to avoid, paid by the reader as lag
 * between their own fingers and their own word. Settling it here keeps the two
 * apart, and `value` stays the answer's own: the field still shows what the list
 * is answering, so a question asked from elsewhere (the popover's deep link)
 * lands in the field like any other.
 *
 * It states **no style of its own**: the height, radius, border and focus ring
 * are all `Input`'s defaults, so the field can never drift from the library or
 * from the controls standing beside it in the toolbar. The single utility it
 * adds is the left padding the magnifier needs, and the caller sizes the field
 * (`className`): how wide the search sits in its row is that row's decision,
 * not this field's.
 */
export function SearchInput({
  value,
  onChange,
  label,
  disabled = false,
  placeholder,
  className,
}: {
  /** The word the list is answering — the settled one, not the one being typed. */
  value: string;
  /** Receives the word once it settles; the field answers keystrokes itself. */
  onChange: (value: string) => void;
  /** e.g. "搜索 Skill". */
  label: string;
  /** Locks the field while what it searches is not available yet. */
  disabled?: boolean;
  /** Overrides the `${label}...` hint, e.g. to say why the field is locked. */
  placeholder?: string;
  className?: string;
}) {
  const [typed, setTyped] = useState(value);
  // A word asked from elsewhere arrives as a new `value`, and the field follows
  // it during render rather than in an effect — the documented way to take a
  // prop change (react.dev, "You Might Not Need an Effect"). It cannot fight
  // the reader, because while they are typing `value` is still the last settled
  // word: the two differ exactly when the *answer* changed, never when the
  // field did.
  const [followed, setFollowed] = useState(value);
  if (value !== followed) {
    setFollowed(value);
    setTyped(value);
  }

  // The word still on its way up, so each keystroke replaces the one before it
  // and a run of typing asks the list once — for the word as it settled.
  // `pending` is the same word in a form the unmount can still hand over: the
  // shared view outlives the page that wrote it (see `lib/list-view`), so a
  // reader who leaves mid-word must not lose the question they just asked.
  const settling = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<string | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(settling.current);
      if (pending.current !== undefined) onChange(pending.current);
    },
    // The handing-over `onChange` is the one this field was mounted with, and a
    // list's field is mounted for that list alone (see `ListToolbar`), so the
    // question can never be written to another list's view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const type = (next: string) => {
    // A locked field says nothing: what it searches is not there to be asked
    // about, so there is no word to hold either.
    if (disabled) return;
    setTyped(next);
    pending.current = next;
    clearTimeout(settling.current);
    settling.current = setTimeout(() => {
      pending.current = undefined;
      onChange(next);
    }, SETTLE_MS);
  };

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={typed}
        onChange={(e) => type(e.target.value)}
        placeholder={placeholder ?? `${label}...`}
        aria-label={label}
        disabled={disabled}
        // shadcn's own defaults for everything a field brings (height, radius,
        // border, focus ring): this component states no style of its own. The
        // one utility here is the left padding the leading magnifier needs —
        // the default's `px-2.5` would sit the placeholder under the glyph.
        className="pl-9"
      />
    </div>
  );
}
