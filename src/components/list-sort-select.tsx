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

/** The orders a list can answer in: a key each, and the i18n key that names it. */
const SORT_LABELS: { sort: ListSort; labelKey: ParseKeys }[] = [
  { sort: "popularity", labelKey: "sort.byPopularity" },
  { sort: "installed", labelKey: "sort.byInstalled" },
  { sort: "tokens", labelKey: "sort.byTokens" },
];

/**
 * The sort switch of a list that answers in more than one order — the installed
 * list today. A labelled menu rather than a row of segmented controls: the
 * orders are *facts* the list is read through (whose figure, whose clock, whose
 * cost), not toggles, so they name themselves in words and stay out of the row
 * until opened.
 *
 * Only ever about the order. The shape the list is read in — repository cards
 * or skill rows — used to ride along here as a "按仓库" option, which made this
 * one value carry two answers: it persisted a shape as though it were a ranking,
 * and a list whose only order is the figure its own rows display (the store)
 * carried a menu of one for it. The shape is the reader's other decision and
 * has its own switch (`ListUnitToggle`), which shows both answers side by side
 * instead of hiding one behind a popup.
 *
 * The trigger states the order on screen — the one thing the reader must
 * always be able to see — and the menu marks the current pick, the same
 * radio semantics the settings menu's own pickers use. A live search stands the
 * ordering down (relevance is the better ranking while a query is live), so the
 * switch locks where it stands rather than offering a choice that does nothing
 * — and rather than leaving the row, which would move the field beside it on
 * every keystroke.
 */
export function ListSortSelect({
  sort,
  onChange,
  sorts,
  disabled = false,
  className,
}: {
  /** The order on screen. */
  sort: ListSort;
  /** Called with the order the reader picked; never with the current one. */
  onChange: (sort: ListSort) => void;
  /**
   * The orders this list answers in, list order included. Absent is every
   * order — the installed list's menu; the store offers the subset its rows can
   * state (see `LIST_SORTS` in `lib/list-view`), which is one order, and the row
   * hosting it then shows no switch at all rather than a menu of one.
   */
  sorts?: readonly ListSort[];
  /**
   * Locks the switch while the list is answering something else — a live search
   * re-ranks its hits, so an order picked now would not be honoured (see
   * `ListToolbar`). Locked, not unmounted, so the row holds still.
   */
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const options = SORT_LABELS.filter(
    ({ sort: value }) => !sorts || sorts.includes(value),
  );
  const current = options.find((option) => option.sort === sort) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // The lock reaches the button, so the control reads as locked and takes
        // no press; Base UI's own `disabled` is set with it so the menu cannot
        // be opened by a key the trigger would otherwise answer.
        disabled={disabled}
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={t("common.listSort")}
            disabled={disabled}
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
            if (options.some((option) => option.sort === value)) {
              onChange(value as ListSort);
            }
          }}
        >
          {options.map(({ sort: value, labelKey }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {t(labelKey)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
