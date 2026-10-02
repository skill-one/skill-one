import { useTranslation } from "react-i18next";

import { useDestinationView, useListQuery } from "../hooks/use-list-view";
import { useRegistrySnapshot } from "../hooks/use-registry-snapshot";
import {
  LIST_SORTS,
  setQuery,
  setScope,
  setSort,
  setUnit,
  type Destination,
  type ListSort,
  type ListUnit,
} from "../lib/list-view";
import { ListFacets, type Facet } from "./list-facets";
import { ListSortSelect } from "./list-sort-select";
import { ListUnitToggle } from "./list-unit-toggle";
import { SearchInput } from "./search-input";

/** The order a list answers in when it was never given another. */
const DEFAULT_SORT: ListSort = "popularity";

/** The shape a list is read in when it was never given another. */
const DEFAULT_UNIT: ListUnit = "skill";

/**
 * A list's own first row: the controls every list is read through, in the order
 * the reading happens — **query, then scope, then shape, then order**. Search
 * names what the reader wants, the picker narrows the answer to a slice of it,
 * the shape says what that slice is made of, and the order says which way it
 * reads, so the row reads left to right as the pipeline it is — the one thing
 * about a list toolbar that every tool settles on the same way (GitHub's issue
 * lists, Linear, Ant Design Pro's table, MUI's `Toolbar`). How wide each one is,
 * and how far apart they stand, is this row's own decision.
 *
 * They sit on the list's row rather than in the window's chrome because they are
 * that list's controls: each is only meaningful above the answer it shapes, and
 * a search field in the header is a field whose list is one route away.
 *
 * They stand as **one tight group on the leading edge** — the field filling the
 * standard `max-w-sm` box the component library caps its own fields at, the view
 * controls at their own widths right beside it — so the row reads as a single
 * control cluster: the eye lands on the field, and the facts standing next to it
 * are the ones the reader reaches for about the same answer. The row's slack is
 * left over at the trailing edge, which is right: the thing that fills this
 * width is the list below, not the row's own controls, and a group split across
 * the full width would read as two regions rather than one toolbar. Only on a
 * window too narrow to hold the group does the field give ground, never the
 * controls.
 *
 * The shape is a **pair of toggles** rather than a third menu, because it is the
 * one answer here that has exactly two values and is about the screen rather than
 * about the data: both arrangements stand on the row at once, so the reader never
 * opens anything to find out which shape they are looking at, and switching costs
 * one press. Sorting keeps its menu because an order names itself in a word and
 * will grow a fifth option; the scope keeps its own because it is a taxonomy, not
 * a shape. The shape used to be the sort's "按仓库" option, which put the
 * arrangement behind a popup and made one stored value answer two questions.
 *
 * While a search is live the scope and the order **lock** rather than leave. A
 * search re-answers by relevance and ignores the scope, so a live control would
 * offer a choice the answer does not honour — but a row that empties itself on
 * the first keystroke and refills on the last moves the field out from under the
 * reader's cursor and throws away the state it was showing. Disabled says what
 * gone says ("not while this is live") while holding the row still, which is why
 * the stand-down is a lock and not an unmount. The shape is exempt: a search
 * answers in sections and those sections are read in the shape the reader chose,
 * so that choice is honoured while a query is live and its switch stays open.
 *
 * A list that answers in one order shows no order control at all: the store's only
 * order is the figure its own rows display, and a menu of one is a control that
 * costs a press to say what the rows are already saying.
 *
 * Where the row's state lives is the shared view's business, not this row's
 * (see `lib/list-view`): the field writes the one query both lists answer, the
 * picker, the shape and the order write this list's own slice of the view, and a
 * list the reader left and came back to is still scoped, shaped and sorted as they
 * left it. So a page hands over only what it alone knows — the counts, the orders
 * its rows can state, whether a query is live.
 */
export function ListToolbar({
  destination,
  facets,
  total,
  sorts,
  searching = false,
}: {
  /** The list this row belongs to; its own query and its own index lock. */
  destination: Destination;
  facets: readonly Facet[];
  /** What 全部 counts, in the unit on screen. */
  total: number;
  /**
   * The orders this list answers in, list order included. Absent is every
   * order — the installed list's own set; the store offers the subset its rows
   * can state.
   */
  sorts?: readonly ListSort[];
  /** Whether a query is live — the row's scope and order lock under it. */
  searching?: boolean;
}) {
  const { t } = useTranslation();
  const query = useListQuery();
  const { sort = DEFAULT_SORT, unit = DEFAULT_UNIT, scope } =
    useDestinationView(destination);
  // `ready` on its own, so a climbing count never re-renders the row.
  const ready = useRegistrySnapshot((s) => s.ready);
  // The store's field stays locked until the index over the registry exists: a
  // query answered over a partially downloaded registry would answer wrongly.
  // The installed list is already in memory, so it never waits for one.
  const waiting = destination === "store" && !ready;
  // A list with nothing to scope has no picker — and a list already scoped
  // keeps it, because that picker is also how the scope is cleared.
  const scopable = facets.length > 0 || scope !== undefined;
  const isCard = unit === "repo";
  // One order needs no switch: the rows already display the order they read in,
  // so a menu of one would cost a press to say what the list is already saying.
  // And the cards have no order to pick: a card is a repository, led by the
  // repository's own stars, so the orders on offer — an install clock, a token
  // cost — are figures the rows carry and the card does not. The control leaves
  // with the shape, and the order the reader picked is still there when the rows
  // come back.
  const sortable = (sorts ?? LIST_SORTS[destination]).length > 1 && !isCard;

  return (
    <div className="mb-3 flex min-w-0 items-center gap-3">
      <SearchInput
        className="w-full max-w-sm"
        value={query}
        onChange={setQuery}
        label={t("common.searchSkills")}
        disabled={waiting}
        placeholder={waiting ? t("common.indexBuilding") : undefined}
      />
      <div className="flex shrink-0 items-center gap-2">
        {scopable && (
          <ListFacets
            facets={facets}
            total={total}
            selected={scope ?? null}
            disabled={searching}
            onSelect={(key) => setScope(destination, key)}
          />
        )}
        <ListUnitToggle
          unit={unit}
          onChange={(next) => setUnit(destination, next)}
        />
        {sortable && (
          <ListSortSelect
            sort={sort}
            sorts={sorts}
            disabled={searching}
            onChange={(next) => setSort(destination, next)}
          />
        )}
      </div>
    </div>
  );
}
