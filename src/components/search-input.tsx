import { useEffect, useRef } from "react";
import { Search } from "lucide-react";

import { Input } from "./ui/input";
import { Kbd, KbdGroup } from "./ui/kbd";

/** Picks the shortcut glyph the platform's own menus would show. */
const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);

/**
 * The list search field: a rounded input with a leading magnifier. `label`
 * names what is being searched and doubles as the accessible label, so the
 * visible hint and the announced one can never drift apart.
 *
 * It closes the header's row, just before the window's settings entry, and it
 * is open all the time: a field that has to be asked for first is a field the
 * reader has to look for first, and searching is the first thing a reader does
 * to a list of eight thousand. The magnifier is decorative and never the click
 * target — the field under it is.
 *
 * Cmd/Ctrl+K calls the field from anywhere on the list pages. The listener
 * lives with the field, so the shortcut exists exactly where the field does:
 * on a detail page there is nothing to summon, and the keystroke falls through.
 */
export function SearchInput({
  value,
  onChange,
  label,
  disabled = false,
  placeholder,
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
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        const field = inputRef.current;
        if (!field || field.disabled) return;
        field.focus();
        field.select();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="relative w-56 shrink-0">
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
