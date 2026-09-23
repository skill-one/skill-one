import { ListUnitToggle } from "./list-unit-toggle";
import { SearchInput } from "./search-input";
import { useDestinationView, useListQuery } from "../hooks/use-list-view";
import { useRegistrySnapshot } from "../hooks/use-registry-snapshot";
import { setQuery, setUnit, type Destination } from "../lib/list-view";

/**
 * The controls every list answers to, bound to the shared view (see
 * `lib/list-view`): what the reader is looking for, and how the list reads.
 *
 * They span the header's row with the brand on the centreline between them —
 * the field opening it, past the corner the traffic lights keep, and the switch
 * closing it. One action per edge: search is what a reader comes to a list to
 * do, and how it reads is the last thing they change. They are *bound* to the
 * shared view rather than to page state, which is what makes them the same
 * controls in both lists: one field to type in, one query to answer, wherever
 * the reader happens to be.
 *
 * The search stays enabled on the installed list and is locked on the store's
 * until the index over the registry exists: the installed list is already in
 * memory, while a query over a partially downloaded registry would answer
 * wrongly.
 */
export function ListToolbar({ destination }: { destination: Destination }) {
  const query = useListQuery();
  const { unit } = useDestinationView(destination);

  // `ready` on its own, so a climbing count never re-renders the list's head.
  const ready = useRegistrySnapshot((s) => s.ready);
  const waiting = destination === "store" && !ready;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <SearchInput
        value={query}
        onChange={setQuery}
        label="搜索 Skill"
        disabled={waiting}
        placeholder={waiting ? "索引构建中…" : undefined}
      />
      <ListUnitToggle
        className="ml-auto"
        unit={unit}
        onChange={(next) => setUnit(destination, next)}
      />
    </div>
  );
}
