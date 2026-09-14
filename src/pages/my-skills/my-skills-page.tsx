import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Ban, Boxes, Check, LayoutGrid, Users } from "lucide-react";

import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import type { InstalledSkill } from "../../lib/skills-manager";
import { installedSkillView, type SkillView } from "../../lib/skill-view";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { FilterDropdown, type FilterOption } from "../../components/filter-dropdown";
import { Placeholder } from "../../components/placeholder";
import { ListPager } from "../../components/list-pager";
import { errorMessage } from "../../lib/utils";
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "../../lib/pagination";
import { buildSearchIndex } from "../../lib/search-index";
import {
  SKILL_CARD_SKELETON_CLASS,
  SKILL_LIST_CLASS,
} from "../../lib/skill-list-layout";
import { useClampedPage } from "../../hooks/use-clamped-page";
import { SearchInput } from "../../components/search-input";
import { SkillCard, type SkillMatched } from "../../components/skill-card";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { SkeletonList } from "../../components/skeleton-list";
import { LinkSuggestionBadge } from "./link-suggestion-badge";
import type { LinkCandidate } from "../../lib/link-suggestions";

/** Enablement filter offered by the toolbar dropdown. */
type EnabledFilter = "all" | "enabled" | "disabled";

const ENABLE_OPTIONS: FilterOption<EnabledFilter>[] = [
  { value: "all", label: "全部", icon: LayoutGrid, neutral: true },
  { value: "enabled", label: "已启用", icon: Check },
  { value: "disabled", label: "已禁用", icon: Ban },
];

/** Placeholder cards while the on-disk list is first read. */
const SKELETON_ROWS = 12;

/** Stable identity for a row: a skill's name is unique in the global directory. */
function rowId(skill: InstalledSkill): string {
  return skill.name;
}

/**
 * One installed skill — the installed list's binding of the shared
 * `SkillCard`, and the counterpart of the store's `SkillListRow`.
 *
 * What the installed list adds to the card is what only it knows. The corner
 * action is the enable switch rather than an install button (`SkillEnableSwitch`,
 * which writes through the backend on its own); a disabled skill is dimmed
 * rather than hidden, so the list still reads as the full inventory. A source
 * the ledger cannot vouch for falls back to the card's own source label, with
 * the migration badge trailing it as the one route to recording where the
 * skill came from.
 *
 * Uninstalling is deliberately absent: it lives in the detail panel, so a card
 * (whose whole body is a click target) never carries an irreversible action.
 */
function InstalledSkillRow({
  view,
  enabled,
  selected,
  matched,
  suggestion,
  onOpen,
}: {
  /** The on-disk record merged with the store entry it resolved to. */
  view: SkillView;
  /** Whether the skill is enabled on disk; a disabled row is dimmed. */
  enabled: boolean;
  /** Whether this card is the one shown in the detail panel. */
  selected: boolean;
  /** Search-hit highlights, so a searched name reads like the store's. */
  matched?: SkillMatched;
  /** Confirmable same-name store entries for a tool-installed skill. */
  suggestion?: LinkCandidate[];
  /** Opens the shared skill detail panel. */
  onOpen: () => void;
}) {
  return (
    <SkillCard
      data-skill={view.name}
      skill={view}
      matched={matched}
      muted={!enabled}
      selected={selected}
      onSelect={onOpen}
      action={<SkillEnableSwitch skill={view} />}
      // A switch that is on is the quiet default and waits for hover; a
      // disabled skill's off switch persists, matching the dimmed card —
      // the reader should see why without reaching for it.
      actionVisibility={enabled ? "on-hover" : "always"}
      // The migration affordance is only meaningful while the source is
      // unknown; a recorded one needs no route to the store.
      sourceExtra={
        !view.repo && suggestion && suggestion.length > 0 ? (
          <LinkSuggestionBadge name={view.name} candidates={suggestion} />
        ) : undefined
      }
    />
  );
}

export function MySkillsPage() {
  const { data: skills, isLoading, isError, error } = useInstalledSkills();

  // Install sources recorded by this app (the provenance ledger), reconciled
  // against the on-disk list on every fetch. Absent entries mean "installed
  // by another tool" — those keep the local-install presentation, and if the
  // registry has plausible namesakes the card offers a confirmable link.
  const { data: provenanceState } = useSkillProvenance();
  const linked = provenanceState?.linked;
  const suggestions = provenanceState?.suggestions;

  // The registry entries behind those recorded sources, keyed by skill name:
  // the store facts an on-disk record never carries (classification, the
  // popularity figure), so the installed list can show the store's card for
  // the skills the ledger placed. Empty for tool installs — nothing to resolve.
  const entries = useInstalledStoreEntries(linked);

  const list = useMemo(() => skills ?? [], [skills]);

  // 1-based current page; the toolbar (search + enablement filter) is local
  // state — the full installed list is already in memory, so everything below
  // filters and slices on the main thread.
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<EnabledFilter>("all");
  // Open skill in the shared detail drawer: an index into `filtered` (the
  // whole result set, across pages), null keeps the drawer closed. Toolbar
  // changes rebuild `filtered`, so they close the drawer to avoid walking a
  // shifted or vanished selection.
  const [selected, setSelected] = useState<number | null>(null);
  const query = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();

  // Any toolbar control changes the result set, so they reset to page 1.
  const handleSearch = (q: string) => {
    setPage(1);
    setSearch(q);
    setSelected(null);
  };
  const handleFilter = (next: EnabledFilter) => {
    setPage(1);
    setFilter(next);
    setSelected(null);
  };

  // Deep link from the menu bar popover: `/my-skills?skill=<name>` pre-fills
  // the search box, which ranks the targeted skill near the top (its name is
  // the whole query, and the name field is boosted) along with any sibling
  // whose terms it shares. The param is consumed (removed) once applied so a
  // refresh stays on the page.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const target = searchParams.get("skill");
    if (!target) return;
    setPage(1);
    setSearch(target);
    setSelected(null);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // The store's single search entry point, over the installed list: a term or
  // the start of one matches, a mistyped word does not. Installed lists are
  // short, so the index is cheap to build here and rebuild when the list
  // changes — unlike the registry, which builds the same index in the worker.
  // The field boosts mirror the registry's priority: what a skill is called
  // beats a description that repeats a trigger phrase. The matched terms the
  // index reports ride along to the cards, exactly as the store's hits do.
  const searchInstalled = useMemo(
    () =>
      buildSearchIndex(list, {
        fields: { name: 4, description: 0.5 },
      }),
    [list],
  );

  // The hits of the current query, or null when browsing. A query orders its
  // own results by relevance; the enablement filter then narrows that list
  // without reordering it.
  const hits = useMemo(
    () => (query ? searchInstalled(query) : null),
    [query, searchInstalled],
  );

  const matchedById = useMemo(() => {
    const matched: Record<string, SkillMatched> = {};
    for (const hit of hits ?? []) matched[rowId(hit.doc)] = hit.matched;
    return matched;
  }, [hits]);

  const filtered = useMemo(() => {
    const docs = hits ? hits.map((hit) => hit.doc) : list;
    return docs.filter((skill) => {
      if (filter === "enabled") return skill.enabled;
      if (filter === "disabled") return !skill.enabled;
      return true;
    });
  }, [hits, list, filter]);

  // One view per listed skill: the on-disk record merged with the store entry
  // its recorded source resolved to. Both the card and the drawer read these
  // objects, so the two can never disagree about what a skill looks like, and
  // the store's facts are present exactly when the registry holds an entry.
  const rows = useMemo(
    () =>
      filtered.map((skill) => ({
        view: installedSkillView(skill, linked, entries[skill.name]),
        enabled: skill.enabled,
      })),
    [filtered, linked, entries],
  );

  const total = rows.length;
  const totalPages = useClampedPage(page, total, PAGE_SIZE, setPage);

  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pageOffset = (page - 1) * PAGE_SIZE;

  // The drawer walks the whole filtered result set, not just the current
  // page, so ←/→ keeps going across page boundaries.
  const detailSkills = useMemo(() => rows.map((row) => row.view), [rows]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-0">
      {/* Toolbar, styled like the store's full list: search first, controls
          clustered on the right. */}
      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={handleSearch} label="搜索 Skill" />

        <div className="ml-auto flex items-center gap-2">
          <AgentAvatarMenu />

          <FilterDropdown
            label="筛选"
            value={filter}
            options={ENABLE_OPTIONS}
            onChange={handleFilter}
          />
        </div>
      </div>

      {/* The skill list, in the store's row shape, with the pager row pinned to
          the bottom. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 -mx-3 -mt-1 overflow-y-auto px-3 pb-0 pt-1">
          {isError ? (
            <Placeholder
              icon={Users}
              message={`加载失败：${errorMessage(error)}`}
            />
          ) : isLoading ? (
            // The same card-shaped skeleton the store lists paint: switching
            // to this page lands on its final layout instead of an empty spin.
            <SkeletonList
              rows={SKELETON_ROWS}
              listClassName={SKILL_LIST_CLASS}
              itemClassName={SKILL_CARD_SKELETON_CLASS}
            />
          ) : list.length === 0 ? (
            <Placeholder icon={Boxes} message="还没有安装任何技能" />
          ) : visible.length === 0 ? (
            <Placeholder
              message={
                query ? `未找到匹配“${query}”的 Skill` : "没有符合条件的 Skill"
              }
            />
          ) : (
            <ul className={SKILL_LIST_CLASS}>
              {visible.map((row, i) => {
                const index = pageOffset + i;
                const id = row.view.name;
                return (
                  <InstalledSkillRow
                    key={id}
                    view={row.view}
                    enabled={row.enabled}
                    selected={selected === index}
                    matched={matchedById[id]}
                    suggestion={suggestions?.[id]}
                    onOpen={() => setSelected(index)}
                  />
                );
              })}
            </ul>
          )}
        </div>

        {!isLoading && !isError && list.length > 0 && (
          <ListPager
            page={page}
            totalPages={totalPages}
            onPage={setPage}
            count={`共 ${total} 个`}
          />
        )}
      </div>

      {/* Same right-side detail drawer the store pages use, told which list
          owns it: the installed surface replaces the store's install CTA with
          the enable switch and shows no registry-only figures. ←/→ walks the
          whole filtered result set, across page boundaries. Uninstalling from
          it closes it: this list shrinks with the skill, so the same index
          would land on a different one — a swap the reader never asked for. */}
      <SkillDetailDrawer
        skills={detailSkills}
        selected={selected}
        onSelect={setSelected}
        onRemoved={() => setSelected(null)}
        surface="installed"
      />
    </div>
  );
}
