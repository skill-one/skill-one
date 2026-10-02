import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { ArrowUpDown } from "lucide-react";

import { cn } from "../lib/utils";
import type { ListSort } from "../lib/list-view";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** The orders a list answers in: a key each, and the i18n key that names it. */
const SORTS: { sort: ListSort; labelKey: ParseKeys }[] = [
  { sort: "popularity", labelKey: "sort.byPopularity" },
  { sort: "installed", labelKey: "sort.byInstalled" },
  { sort: "repo", labelKey: "sort.byRepo" },
];

/**
 * The sort switch of a list that answers in more than one order — the
 * installed list, today. A labelled menu rather than a row of segmented
 * controls: the orders are *facts* the list is read through (whose figure,
 * whose clock, whose shape), not toggles, so they name themselves in words
 * and stay out of the row until opened. The third option carries the shape
 * the old unit switch picked — repository cards — so one control now answers
 * both "what does the screen look like" and "what order does it read in".
 *
 * The trigger states the order on screen — the one thing the reader must
 * always be able to see — and the menu marks the current pick, the same
 * radio semantics the settings menu's own pickers use. A search stands the
 * ordering down (relevance is the better ranking while a query is live), so
 * the page hides the control along with the chips rather than offering a
 * choice that does nothing.
 */
export function ListSortSelect({
  sort,
  onChange,
  className,
}: {
  /** The order on screen. */
  sort: ListSort;
  /** Called with the order the reader picked; never with the current one. */
  onChange: (sort: ListSort) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const current = SORTS.find((option) => option.sort === sort) ?? SORTS[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t("common.listSort")}
            className={cn("shrink-0", className)}
          />
        }
      >
        <ArrowUpDown aria-hidden />
        {t(current.labelKey)}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        <DropdownMenuRadioGroup
          value={sort}
          onValueChange={(value) => {
            if (SORTS.some((option) => option.sort === value)) {
              onChange(value as ListSort);
            }
          }}
        >
          {SORTS.map(({ sort: value, labelKey }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
