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
import { ListCorpus } from "./list-corpus";
import { ListFacets, type Facet } from "./list-facets";
import { ListSortSelect } from "./list-sort-select";
import { ListUnitToggle } from "./list-unit-toggle";
import { SearchInput } from "./search-input";

/** The order a list answers in when it was never given another. */
const DEFAULT_SORT: ListSort = "popularity";

/** The shape a list is read in when it was never given another. */
const DEFAULT_UNIT: ListUnit = "skill";

/**
 * A list's own first row: the controls a browse list is read through — what the
 * reader is looking for and the shape on the leading edge, the scope and the
 * order docked to the trailing one.
 *
 * They sit on the list's row rather than in the window's chrome because they are
 * that list's own controls: each is only meaningful above the answer it shapes,
 * and a search field in the header is a field whose list is one route away — it
 * has to jump to answer, and what it answers is somebody else's question. Here
 * the question and the answer are on one screen, so typing re-answers *this*
 * list: the store's field asks the registry, the installed list's asks what this
 * machine has (see `SearchResults`, which answers both the same way).
 *
 * **The field and the shape lead, because those are the two a search does not
 * override.** While a question is live the scope and the order lock: a search
 * re-ranks the whole list by relevance and ignores the taxonomy slice, so a
 * scope picked now and an order picked now would promise narrowing and ranking
 * the answer does not have. Locked rather than removed, so the row holds still
 * under the reader's cursor instead of jumping on the first keystroke. Docking
 * that pair to the trailing edge is also where the tools put the controls that
 * read the answer — MUI's density and columns, Ant Design Pro's 密度 and 列设置,
 * Airtable's sort and view options, GitHub's sort on the issue list — so the row
 * lands where those rows land instead of trailing 700px of slack. The field
 * keeps the standard `max-w-sm` box the component library caps its own fields
 * at, and the slack between the two groups is the row's, to be spent on nothing.
 *
 * The shape is a **pair of toggles** rather than a menu, because it is the one
 * answer here that has exactly two values and is about the screen rather than
 * about the data: both arrangements stand on the row at once, so the reader never
 * opens anything to find out which shape they are looking at, and switching costs
 * one press. It stays open under a live search too — relevance is a ranking of
 * the same entries, not another list — so a search is read in either shape.
 * Sorting keeps its menu because an order names itself in a word and will grow a
 * fifth option; the scope keeps its own because it is a taxonomy, not a shape.
 * The shape used to be the sort's "按仓库" option, which put the arrangement
 * behind a popup and made one stored value answer two questions.
 *
 * A list that answers in one order shows no order control at all: the store's only
 * order is the figure its own rows display, and a menu of one is a control that
 * costs a press to say what the rows are already saying.
 *
 * The row's slack — the stretch between the two groups, which nothing else wants
 * — carries the corpus's two figures (see `ListCorpus`): a readout rather than a
 * fifth control, and the one thing on the row that answers about the corpus
 * instead of about the answer, which is why it stays put while the shape changes
 * and while a question is live.
 *
 * The store's field is locked until the worker's index over the registry exists:
 * a question answered over a half-downloaded registry answers wrongly, and the
 * row says why it is locked instead of refusing in silence (see
 * `common.indexBuilding`). The installed list is already in memory, so its field
 * never waits for one.
 *
 * Where the row's state lives is the shared view's business, not this row's
 * (see `lib/list-view`): the question, the picker, the shape and the order write
 * this list's own slice of the view, and a list the reader left and came back to
 * is still scoped, shaped and sorted as they left it. So a page hands over only
 * what it alone knows — the counts and the orders its rows can state, the size of
 * the corpus it reads, plus whether a question has settled.
 */
export function ListToolbar({
  destination,
  facets,
  total,
  sorts,
  corpus,
  searching = false,
}: {
  /** The list this row belongs to; its own question, order, shape and scope. */
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
  /**
   * How much there is to read from, both units at once; see `ListCorpus` for why
   * it does not follow the shape. Absent is a row that states no size.
   */
  corpus?: {
    skills: number;
    repos: number;
    variant?: "registry" | "installed";
  };
  /**
   * Whether a question has settled — the page's debounced, trimmed answer, not
   * the raw field value, which would lock the row on the first keystroke of a
   * word that is still being typed.
   */
  searching?: boolean;
}) {
  const { t } = useTranslation();
  const query = useListQuery(destination);
  const { sort = DEFAULT_SORT, unit = DEFAULT_UNIT, scope } =
    useDestinationView(destination);
  // `ready` on its own, so a climbing count never re-renders the row.
  const ready = useRegistrySnapshot((snapshot) => snapshot.ready);
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
        onChange={(next) => setQuery(destination, next)}
        label={t("common.searchSkills")}
        disabled={waiting}
        placeholder={waiting ? t("common.indexBuilding") : undefined}
      />
      <ListUnitToggle
        unit={unit}
        onChange={(next) => setUnit(destination, next)}
      />
      {/* The corpus's own two figures, in the slack the row already keeps: the
          size of what is being read, which is neither the question nor any of the
          three answers beside it — and the one figure here that does not move
          when the shape does. */}
      {corpus && <ListCorpus {...corpus} />}
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {scopable && (
          <ListFacets
            facets={facets}
            total={total}
            selected={scope ?? null}
            disabled={searching}
            onSelect={(key) => setScope(destination, key)}
          />
        )}
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
