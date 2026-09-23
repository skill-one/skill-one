import { Search } from "lucide-react";

import { Input } from "./ui/input";

/**
 * The list search field: a rounded input with a leading magnifier. `label`
 * names what is being searched and doubles as the accessible label, so the
 * visible hint and the announced one can never drift apart.
 *
 * It opens the header's row, right after the corner the traffic lights keep, and
 * it is open all the time: a field that has to be asked for first is a field the
 * reader has to look for first, and searching is the first thing a reader does
 * to a list of eight thousand. The magnifier is decorative and never the click
 * target — the field under it is.
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
  return (
    <div className="relative w-56 shrink-0">
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
