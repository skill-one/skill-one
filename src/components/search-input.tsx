import { Search } from "lucide-react";

import { cn } from "../lib/utils";
import { Input } from "./ui/input";

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
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `${label}...`}
        aria-label={label}
        disabled={disabled}
        className="h-8 rounded-full pl-9"
      />
    </div>
  );
}