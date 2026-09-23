import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { domainLabel, domainMeta } from "../data/domains";
import { FACET_GAP, useFacetOverflow } from "../hooks/use-facet-overflow";
import { DomainChip } from "./domain-chip";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

/** One scope of a list, as its chip shows it. */
export interface Facet {
  key: string;
  count: number;
}

/**
 * The scope chips of the list on screen: 全部, then as many classifications as
 * the line holds, then 更多 for the rest.
 *
 * It opens that list's own content, above its first row. The categories are the
 * list's taxonomy and the counts are its own figures, so nothing here belongs to
 * the shell — and the row narrows the list it sits on, which is where the reader
 * looks for it.
 *
 * One line, fixed height, and the overflow does not scroll: a row of scopes that
 * has to be scrolled to be read hides things behind a gesture nobody performs
 * over a list. What does not fit is named in a flyout instead, one press away,
 * and the chosen scope stays on the line even when it is one of them — the
 * active filter is the one chip the reader must always be able to see.
 */
export function ListFacets({
  facets,
  total,
  countLabel,
  selected,
  onSelect,
}: {
  facets: readonly Facet[];
  /** What 全部 counts, in the unit on screen. */
  total: number;
  /** What a count counts, named in a chip's tip (e.g. 个 skill). */
  countLabel: string;
  /** The scope on screen, by key; null is 全部. */
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const { rowRef, measureRef, moreRef, visibleCount } = useFacetOverflow(
    facets.length,
  );
  const [open, setOpen] = useState(false);

  const shown = visibleCount === null ? facets : facets.slice(0, visibleCount);
  const hidden = visibleCount === null ? [] : facets.slice(visibleCount);
  const hiddenScope =
    selected !== null && hidden.some((facet) => facet.key === selected);

  const chip = (
    facet: Facet,
    { expanded = false, onPick }: { expanded?: boolean; onPick?: () => void } = {},
  ) => (
    <DomainChip
      key={facet.key}
      selected={selected === facet.key}
      emoji={domainMeta(facet.key)?.emoji}
      count={facet.count}
      countLabel={countLabel}
      expanded={expanded}
      onClick={onPick ?? (() => onSelect(facet.key))}
    >
      {domainLabel(facet.key)}
    </DomainChip>
  );

  return (
    <div className="relative flex min-w-0 flex-1 items-center" style={{ gap: FACET_GAP }}>
      <DomainChip
        selected={selected === null}
        count={total}
        countLabel={countLabel}
        expanded
        onClick={() => onSelect(null)}
      >
        全部
      </DomainChip>

      <div
        ref={rowRef}
        className="flex min-w-0 flex-1 items-center overflow-hidden"
        style={{ gap: FACET_GAP }}
      >
        {shown.map((facet) => chip(facet))}
        {hidden.length > 0 && (
          <Popover open={open} onOpenChange={setOpen}>
            {/* The trigger's own span: the line measures it to know what room
                the control needs, and a trigger's element is the library's. */}
            <span ref={moreRef} className="shrink-0">
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant={hiddenScope ? "default" : "outline"}
                    size="sm"
                    aria-label={hiddenScope ? `更多分类，已选 ${domainLabel(selected)}` : "更多分类"}
                  />
                }
              >
                <span className="max-w-24 truncate whitespace-nowrap">
                  {hiddenScope ? domainLabel(selected) : "更多"}
                </span>
                <ChevronDown />
              </PopoverTrigger>
            </span>
            <PopoverContent align="start" className="w-auto max-w-md p-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {hidden.map((facet) =>
                  chip(facet, {
                    // Named in full here: a flyout is not a row of glyphs to
                    // scan, so nothing is hidden behind a hover.
                    expanded: true,
                    onPick: () => {
                      onSelect(facet.key);
                      setOpen(false);
                    },
                  }),
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {/* The measuring line: every chip, laid out but invisible, so the count
          above can be computed without the row first having to hide any of
          them. Out of flow, so it costs the header nothing. */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute flex items-center"
        style={{ gap: FACET_GAP }}
      >
        {facets.map((facet) => chip(facet))}
      </div>
    </div>
  );
}
