import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

import { domainLabel, fullTagEmoji } from "../data/domains";
import { useAppLocale } from "../i18n/use-language";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** One scope of a list, as the filter counts it. */
export interface Facet {
  key: string;
  count: number;
}

/**
 * The radio value standing for 全部 — no domain key of the taxonomy reads
 * "all", so the two can never collide.
 */
const ALL = "all";

/**
 * The scope picker of a list: one dropdown, not a row of chips.
 *
 * A menu rather than a line of toggles, the same call `ListSortSelect` makes
 * for the sort: the scopes are *facts* the list is read through, so they stay
 * out of the row until opened, and the trigger states the current scope — the
 * one thing the reader must always be able to see. The menu marks the current
 * pick with radio semantics, 全部 first, then every scope the list holds, each
 * with its count, so the whole taxonomy is one press away and nothing depends
 * on how wide the line is.
 */
export function ListFacets({
  facets,
  total,
  selected,
  onSelect,
  disabled = false,
}: {
  facets: readonly Facet[];
  /** What 全部 counts, in the unit on screen. */
  total: number;
  /** The scope on screen, by key; null is 全部. */
  selected: string | null;
  onSelect: (key: string | null) => void;
  /**
   * Locks the picker while the list is answering something else — a live search
   * re-ranks the whole registry by relevance and ignores the scope, so a scope
   * picked now would not narrow anything (see `ListToolbar`). Locked, not
   * unmounted, so the row holds still under the reader's cursor.
   */
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const locale = useAppLocale();

  const current = facets.find((facet) => facet.key === selected);
  const currentEmoji = selected === null ? undefined : fullTagEmoji(selected);
  const currentLabel =
    selected === null ? t("facet.all") : domainLabel(selected, locale);

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
            variant={selected === null ? "outline" : "default"}
            size="sm"
            aria-label={t("facet.categories")}
            disabled={disabled}
            className="shrink-0"
          />
        }
      >
        {currentEmoji && (
          <span aria-hidden="true" className="text-[13px] leading-none">
            {currentEmoji}
          </span>
        )}
        <span className="max-w-40 truncate whitespace-nowrap">
          {currentLabel}
        </span>
        <span className="text-[11px] tabular-nums opacity-70">
          {current ? current.count : total}
        </span>
        <ChevronDown aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-44">
        <DropdownMenuRadioGroup
          value={selected ?? ALL}
          onValueChange={(value) => {
            // A stale key this build does not know, or one of this menu's own
            // values, is no scope to file under; only real keys pass through.
            if (value === ALL || typeof value === "string") {
              onSelect(value === ALL ? null : value);
            }
          }}
        >
          {/* A scope is one pick and done: the menu closes on the press,
              unlike the radio item's own default, which leaves it open. */}
          <DropdownMenuRadioItem value={ALL} closeOnClick>
            {t("facet.all")}
            <span className="pl-1.5 text-xs tabular-nums text-muted-foreground">
              {total}
            </span>
          </DropdownMenuRadioItem>
          {facets.map((facet) => {
            const emoji = fullTagEmoji(facet.key);
            return (
              <DropdownMenuRadioItem
                key={facet.key}
                value={facet.key}
                closeOnClick
              >
                {emoji && (
                  <span aria-hidden="true" className="text-[13px] leading-none">
                    {emoji}
                  </span>
                )}
                {domainLabel(facet.key, locale)}
                <span className="pl-1.5 text-xs tabular-nums text-muted-foreground">
                  {facet.count}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
