import { ListUnitToggle } from "./list-unit-toggle";
import { SearchInput } from "./search-input";
import { useDestinationView, useListQuery } from "../hooks/use-list-view";
import { useRegistrySnapshot } from "../hooks/use-registry-snapshot";
import { setQuery, setUnit, type Destination } from "../lib/list-view";

/**
 * The controls every list answers to, bound to the shared view (see
 * `lib/list-view`): what the reader is looking for, and how the list reads.
 *
 * They live in the header and not on the pages because both lists want the same
 * two controls in the same place, and a control that travels with the page is a
 * control the reader has to find again after every switch. A page keeps only
 * what is its own — the scope chips, its trailing action, its list.
 *
 * The search stays enabled on the installed list and is locked on the store's
 * until the index over the registry exists: the installed list is already in
 * memory, while a query over a partially downloaded registry would answer
 * wrongly.
 */
export function ListToolbar({ destination }: { destination: Destination }) {
  const query = useListQuery();
  const { unit } = useDestinationView(destination);

  // `ready` on its own, so a climbing count never re-renders the header.
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
        // Grows to its cap and shrinks below it, but never past a usable
        // width: the header holds the brand, both destinations, this field
        // and the settings entry inside the window's minimum width.
        className="min-w-[9rem] flex-1 max-w-sm"
      />
      <ListUnitToggle
        unit={unit}
        onChange={(next) => setUnit(destination, next)}
        className="shrink-0"
      />
    </div>
  );
}
