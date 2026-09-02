import { Search } from "lucide-react";

import { Input } from "./ui/input";

/**
 * The list pages' search field: a rounded input with a leading magnifier.
 * `label` names what is being searched and doubles as the accessible label,
 * so the visible hint and the announced one can never drift apart.
 */
export function SearchInput({
  value,
  onChange,
  label,
}: {
  value: string;
  /** Receives the raw field value; debouncing is the caller's. */
  onChange: (value: string) => void;
  /** e.g. "搜索 Skill" / "搜索仓库". */
  label: string;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label}...`}
        aria-label={label}
        className="h-9 rounded-full pl-9"
      />
    </div>
  );
}
