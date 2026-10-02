import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

import {
  setSearchField,
  takeSearchRequest,
} from "../lib/search-shortcut";
import { cn } from "../lib/utils";
import { Input } from "./ui/input";
import { Kbd, KbdGroup } from "./ui/kbd";

/** Picks the shortcut glyph the platform's own menus would show. */
const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);

/**
 * The list search field: a rounded input with a leading magnifier. `label`
 * names what is being searched and doubles as the accessible label, so the
 * visible hint and the announced one can never drift apart.
 *
 * It opens its list's own row, the one the scope and the order stand on (see
 * `ListToolbar`), and is open all the time: a field that has to be asked for
 * first is a field the reader has to look for first, and searching is the first
 * thing a reader does to a list of eight thousand. The magnifier is decorative
 * and never the click target — the field under it is.
 *
 * The field is where it is because it is a control of a list: it narrows the
 * list below it, so it belongs to that list's row, not to the window's chrome.
 * Cmd/Ctrl+K still reaches it from anywhere (see `lib/search-shortcut`), which
 * is what keeps a shortcut that never leaves the row from being a shortcut into
 * a row. The field registers itself on the way in and answers a shortcut that
 * arrived before it — the reader who pressed Cmd/Ctrl+K on the agents graph is
 * standing in the store's list a moment later, in the field, not looking for it.
 *
 * The caller sizes the field (`className`): how wide the search sits in its row
 * is that row's decision, not this field's.
 */
export function SearchInput({
  value,
  onChange,
  label,
  disabled = false,
  placeholder,
  className,
}: {
  value: string;
  /** Receives the raw field value; debouncing is the caller's. */
  onChange: (value: string) => void;
  /** e.g. "搜索 Skill". */
  label: string;
  /** Locks the field while what it searches is not available yet. */
  disabled?: boolean;
  /** Overrides the `${label}...` hint, e.g. to say why the field is locked. */
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) return;
    setSearchField(field);
    // A shortcut pressed where this list was not on screen waits for the field
    // rather than for a keystroke: the reader asked to search, and the list they
    // landed on is the one holding the answer.
    if (takeSearchRequest() && !field.disabled) {
      field.focus();
      field.select();
    }
    return () => setSearchField(null);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `${label}...`}
        aria-label={label}
        disabled={disabled}
        className={`h-8 rounded-full pl-9 ${isMac ? "pr-11" : "pr-16"}`}
      />
      {!disabled && (
        <KbdGroup
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2"
        >
          {isMac ? (
            <Kbd>⌘K</Kbd>
          ) : (
            <>
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </>
          )}
        </KbdGroup>
      )}
    </div>
  );
}
