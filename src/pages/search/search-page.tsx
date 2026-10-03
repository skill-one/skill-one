import { useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";

import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useInstalledSearchRows } from "../../hooks/use-installed-search";
import { SEARCH_QUERY_PARAM } from "../../components/app-header";
import type { ListUnit } from "../../lib/list-view";
import { ListUnitToggle } from "../../components/list-unit-toggle";
import { Placeholder } from "../../components/placeholder";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { SearchResults } from "../explore/search-results";
import { LinkSuggestionBadge } from "../installed/link-suggestion-badge";

/**
 * The independent search page: one question, asked of every collection at once —
 * what this machine has, what the store carries, what skills.sh answers live
 * (see `SearchResults`).
 *
 * The question lives in the URL (`?q=`), not in a module store: a search is
 * shareable, and the back button is the way out of it. The header's field writes
 * the param (see `searchPath`); this page only reads it, debounced, so keystrokes
 * stay instant while the worker query settles. An empty question shows a prompt
 * rather than an answer.
 *
 * The unit switch is this page's own state, and deliberately not the lists' own:
 * how the answer reads here must not move how the store's or the installed list's
 * browse answers read (see `lib/list-view`, which is why this is `useState` and
 * not `setUnit`). The installed rows carry the installed surface (the enable
 * switch, the dimmed disabled install, the migration badge), so a skill can be
 * managed from its search hit.
 */
export function SearchPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const rawQuery = searchParams.get(SEARCH_QUERY_PARAM) ?? "";
  const query = useDebouncedValue(rawQuery).trim();
  const [unit, setUnit] = useState<ListUnit>("repo");

  // The installed answer, render-ready with the installed surface's own action —
  // the page alone knows the enable switch and the link suggestions behind them.
  const installedRows = useInstalledSearchRows(query);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The page's own first row: only the unit switch. The search field lives
          in the header; there is no scope filter, because a search re-answers
          every collection at once. */}
      <div className="mb-3 flex min-w-0 items-center gap-3">
        <ListUnitToggle
          className="ml-auto"
          unit={unit}
          onChange={setUnit}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pb-5">
          {query.length === 0 ? (
            <Placeholder message={`${t("common.searchSkills")}...`} />
          ) : (
            // Keyed by the answer's definition, so no stale fold or selection
            // survives into a differently-shaped answer.
            //
            // `destination="search"`: this page asks the question of every
            // collection at once, so the registry's index leads (it is the
            // cheapest certain answer), this machine's own installs read beside
            // it as one more source, and the skills.sh answer waits behind its
            // press — the three layers every searchable surface reads, so this
            // page is one more reader rather than a fourth shape (see
            // `SearchResults`).
            <SearchResults
              key={`${unit}:${query}`}
              unit={unit}
              query={query}
              destination="search"
              installed={installedRows.map((row) => ({
                skill: row.skill,
                matched: row.matched,
                muted: !row.enabled,
                extra: !row.skill.repo ? (
                  <LinkSuggestionBadge
                    name={row.skill.name}
                    localDescription={row.skill.description}
                    candidates={row.suggestion ?? []}
                    variant="label"
                  />
                ) : undefined,
                action: <SkillEnableSwitch skill={row.skill} />,
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
}