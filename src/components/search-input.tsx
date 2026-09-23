import { Search } from "lucide-react";

import { cn } from "../lib/utils";
import { Input } from "./ui/input";

/**
 * The list search field: a rounded input with a leading magnifier. `label`
 * names what is being searched and doubles as the accessible label, so the
 * visible hint and the announced one can never drift apart.
 *
 * The width belongs to the caller: the field now sits in the header, where how
 * much room it gets decides whether the row fits at the window's minimum size.
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
    <div className={cn("relative w-full", className)}>
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? `${label}...`}
        aria-label={label}
        disabled={disabled}
        className="h-9 rounded-full pl-9"
      />
    </div>
  );
}
