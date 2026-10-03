import { useDestinationView } from "../hooks/use-list-view";
import {
  LIST_SORTS,
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

/** The order a list answers in when it was never given another. */
const DEFAULT_SORT: ListSort = "popularity";

/** The shape a list is read in when it was never given another. */
const DEFAULT_UNIT: ListUnit = "skill";

/**
 * A list's own first row: the controls a browse list is read through — the shape
 * on the leading edge, the scope and the order docked to the trailing one.
 *
 * **The search field is not here.** It lives in the window's chrome (see
 * `AppHeader`) because it answers on every route at once: it is a jump pad into
 * the search page, and the question it holds lives in that page's URL. A browse
 * list holds no question, so there is nothing here for a search to override —
 * which is why nothing on this row locks any more.
 *
 * They sit on the list's row rather than in the chrome because they are that
 * list's own controls: each is only meaningful above the answer it shapes. The
 * shape leads and the reading pair trails, which is where the tools put the
 * controls that read the answer — MUI's density and columns, Ant Design Pro's
 * 密度 and 列设置, Airtable's sort and view options, GitHub's sort on the issue
 * list — so the row lands where those rows land instead of trailing 700px of
 * slack.
 *
 * The shape is a **pair of toggles** rather than a menu, because it is the one
 * answer here that has exactly two values and is about the screen rather than
 * about the data: both arrangements stand on the row at once, so the reader never
 * opens anything to find out which shape they are looking at, and switching costs
 * one press. Sorting keeps its menu because an order names itself in a word and
 * will grow a fifth option; the scope keeps its own because it is a taxonomy, not
 * a shape. The shape used to be the sort's "按仓库" option, which put the
 * arrangement behind a popup and made one stored value answer two questions.
 *
 * A list that answers in one order shows no order control at all: the store's only
 * order is the figure its own rows display, and a menu of one is a control that
 * costs a press to say what the rows are already saying.
 *
 * Where the row's state lives is the shared view's business, not this row's
 * (see `lib/list-view`): the picker, the shape and the order write this list's own
 * slice of the view, and a list the reader left and came back to is still scoped,
 * shaped and sorted as they left it. So a page hands over only what it alone knows
 * — the counts and the orders its rows can state.
 */
export function ListToolbar({
  destination,
  facets,
  total,
  sorts,
}: {
  /** The list this row belongs to; its own order, shape and scope. */
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
}) {
  const { sort = DEFAULT_SORT, unit = DEFAULT_UNIT, scope } =
    useDestinationView(destination);
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
      <ListUnitToggle
        unit={unit}
        onChange={(next) => setUnit(destination, next)}
      />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {scopable && (
          <ListFacets
            facets={facets}
            total={total}
            selected={scope ?? null}
            onSelect={(key) => setScope(destination, key)}
          />
        )}
        {sortable && (
          <ListSortSelect
            sort={sort}
            sorts={sorts}
            onChange={(next) => setSort(destination, next)}
          />
        )}
      </div>
    </div>
  );
}
