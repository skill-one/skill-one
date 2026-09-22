import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import {
  Boxes,
  CalendarDays,
  FolderGit2,
  LayoutGrid,
  ToggleLeft,
  Users,
} from "lucide-react";

import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import type { InstalledSkill } from "../../lib/skills-manager";
import { installedSkillView, type SkillView } from "../../lib/skill-view";
import { TIME_BUCKETS, timeBucketOf } from "../../lib/time-buckets";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { FilterDropdown, type FilterOption } from "../../components/filter-dropdown";
import { Placeholder } from "../../components/placeholder";
import { errorMessage } from "../../lib/utils";
import { domainLabel, domainMeta } from "../../data/domains";
import { buildSearchIndex } from "../../lib/search-index";
import {
  SKILL_CARD_SKELETON_CLASS,
  SKILL_LIST_CLASS,
} from "../../lib/skill-list-layout";
import { SearchInput } from "../../components/search-input";
import { SkillCard, type SkillMatched } from "../../components/skill-card";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { SkeletonList } from "../../components/skeleton-list";
import { LinkSuggestionBadge } from "./link-suggestion-badge";
import type { LinkCandidate } from "../../lib/link-suggestions";
import { GroupSection, type GroupMeta } from "../explore/group-section";

/**
 * The grouping modes the toolbar offers. Each mode buckets the installed
 * list and orders the groups itself, so one choice replaces the old
 * grouping-plus-filter pair:
 *
 * - `repo`: one group per source repository (from the provenance ledger);
 *   skills installed by other tools pool into 未关联仓库.
 * - `time`: the install timeline — 今天 / 近 7 天 / … / 更早
 *   (`lib/time-buckets`). The one mode whose sections are ordered *by the
 *   data* rather than by size, which is what makes it read as a chronology;
 *   its ordinals are consequently un-medalled.
 * - `status`: the enablement split — 已启用 / 已禁用 — the old toolbar
 *   filter, promoted to a grouping.
 * - `domain`: the store's classification; skills the registry cannot
 *   classify pool into 未分类.
 */
type MyGroupBy = "repo" | "time" | "status" | "domain";

const GROUP_OPTIONS: Array<FilterOption<MyGroupBy>> = [
  { value: "repo", label: "按仓库", icon: FolderGit2 },
  { value: "time", label: "按时间", icon: CalendarDays },
  { value: "status", label: "按状态", icon: ToggleLeft },
  { value: "domain", label: "按类型", icon: LayoutGrid },
];

/** How many groups mount with the page, and how many more mount each time
 * the reader scrolls the list's sentinel into view — the same progressive
 * pacing the store's grouped list uses. */
const INITIAL_GROUPS = 6;
const GROUP_CHUNK = 6;

/** Placeholder cards while the on-disk list is first read. */
const SKELETON_ROWS = 12;

/**
 * One row of the grouped list: everything rendering an installed skill's
 * card needs, precomputed where the grouping pass runs.
 */
interface Row {
  view: SkillView;
  enabled: boolean;
  suggestion?: LinkCandidate[];
}

/** The grouped answer for one mode: identity metadata plus its rows. */
interface MyGroup {
  meta: GroupMeta;
  items: Row[];
}

/** A group that pools the rows no mode-specific key names. */
const POOL_TITLE_BY_MODE = {
  repo: "未关联仓库",
  domain: "未分类",
} as const;

/**
 * Bucket the rows by the requested mode. Every mode starts from the rows in
 * list order (a search has already reordered them by relevance) and keeps
 * that order inside each bucket.
 *
 * The groups themselves follow their mode. The pooling modes (`repo`,
 * `domain`) lead with the most-populated bucket, ties resolved by title; the
 * modes that carry a reading order of their own emit their sections in it and
 * simply drop the empty ones — `time` newest first, `status` running skills
 * first.
 *
 * `time` also reorders *within* its sections, the one place a mode overrides
 * the incoming list order: a timeline whose contents ran alphabetically would
 * not be a timeline. Relevance is then only what *selects* the rows of a
 * search, never how they are laid out.
 */
function buildGroups(rows: Row[], groupBy: MyGroupBy): MyGroup[] {
  if (groupBy === "time") {
    // The timeline. Sections are positional (newest first) rather than
    // weighed, so this must never reach the size ordering at the tail below;
    // an empty stretch is simply absent, and a skill whose install time was
    // never recorded keeps a section of its own instead of being filed under
    // 更早, which would claim more than the record does.
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const key = timeBucketOf(row.view.installedAt);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
    // Chronological inside a section too, not just between them — otherwise a
    // timeline's contents read alphabetically. This is what makes a batch
    // legible: one `add owner/repo` gives every skill it installs the same
    // second, so the run of cards it produced stays together instead of being
    // scattered through the section by name. A skill with no recorded time
    // sorts last, which `?? 0` gives for free.
    for (const items of buckets.values()) {
      items.sort(
        (a, b) => (b.view.installedAt ?? 0) - (a.view.installedAt ?? 0),
      );
    }
    const groups: MyGroup[] = [];
    for (const bucket of TIME_BUCKETS) {
      const items = buckets.get(bucket.key);
      if (items) {
        groups.push({
          meta: { key: bucket.key, title: bucket.title, ordinal: "plain" },
          items,
        });
      }
    }
    return groups;
  }

  if (groupBy === "status") {
    // The enablement split has a natural order — running skills first — and
    // empty halves are simply not shown.
    const enabled = rows.filter((row) => row.enabled);
    const disabled = rows.filter((row) => !row.enabled);
    return [
      { meta: { key: "status-enabled", title: "已启用" }, items: enabled },
      { meta: { key: "status-disabled", title: "已禁用" }, items: disabled },
    ].filter((group) => group.items.length > 0);
  }

  const poolTitle = POOL_TITLE_BY_MODE[groupBy];
  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    // A skill may be classified under several domains, so it lands in every
    // domain group it belongs to. Everything the mode cannot key — an
    // unrecorded source, an unclassified skill — pools under one title.
    const keys =
      groupBy === "repo"
        ? [row.view.repo || poolTitle]
        : row.view.profile?.domain.length
          ? row.view.profile.domain
          : [poolTitle];
    for (const key of keys) {
      const bucket = buckets.get(key);
      if (bucket) bucket.push(row);
      else buckets.set(key, [row]);
    }
  }
  return Array.from(buckets, ([key, items]) => {
    if (groupBy === "repo" && key !== poolTitle) {
      return {
        meta: {
          key: `repo-${key}`,
          title: key,
          avatarOwner: key.split("/")[0],
        },
        items,
      };
    }
    if (groupBy === "domain" && key !== poolTitle) {
      return {
        meta: {
          key: `domain-${key}`,
          title: domainLabel(key),
          emoji: domainMeta(key)?.emoji,
        },
        items,
      };
    }
    return { meta: { key, title: key }, items };
  }).toSorted(
    (a, b) =>
      b.items.length - a.items.length || a.meta.title.localeCompare(b.meta.title),
  );
}

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
  const storeEntries = useInstalledStoreEntries(linked);

  const list = useMemo(() => skills ?? [], [skills]);

  // Search and grouping mode are local state — the full installed list is
  // already in memory, so everything below filters and groups on the main
  // thread.
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<MyGroupBy>("repo");
  // Open skill in the shared detail drawer, tracked by NAME rather than by
  // index: the provenance and store-entry queries land asynchronously and
  // regroup the list under the reader's pointer, so an index captured at
  // click time could point at a different skill a moment later. The drawer's
  // index is derived from the name at render time, and a not-yet-resolved
  // name keeps the drawer closed until the groups settle.
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const query = useDebouncedValue(search).trim();
  // Progressive rendering: only the first `visibleCount` groups are mounted;
  // an IntersectionObserver on the sentinel below the list extends the count
  // while the reader scrolls.
  const [visibleCount, setVisibleCount] = useState(INITIAL_GROUPS);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleSearch = (q: string) => {
    setSearch(q);
    setSelectedName(null);
    setVisibleCount(INITIAL_GROUPS);
  };
  const handleGroupBy = (mode: MyGroupBy) => {
    setGroupBy(mode);
    setSelectedName(null);
    setVisibleCount(INITIAL_GROUPS);
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
    setSearch(target);
    setSelectedName(null);
    setVisibleCount(INITIAL_GROUPS);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // The store's single search entry point, over the installed list: a skill is
  // found by name, every query term must match, a mistyped word does not.
  // Installed lists are short, so the index is cheap to build here and rebuild
  // when the list changes — unlike the registry, which builds the same index in
  // the worker. The matched terms the index reports ride along to the cards,
  // exactly as the store's hits do.
  const searchInstalled = useMemo(() => buildSearchIndex(list), [list]);

  // The hits of the current query, or null when browsing. A query orders its
  // own results by relevance; the enablement state then only decides which
  // group a skill lands in.
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
    return docs;
  }, [hits, list]);

  // One view per listed skill: the on-disk record merged with the store entry
  // its recorded source resolved to. Both the card and the drawer read these
  // objects, so the two can never disagree about what a skill looks like, and
  // the store's facts are present exactly when the registry holds an entry.
  const rows = useMemo<Row[]>(
    () =>
      filtered.map((skill) => ({
        view: installedSkillView(skill, linked, storeEntries[skill.name]),
        enabled: skill.enabled,
        suggestion: suggestions?.[skill.name],
      })),
    [filtered, linked, storeEntries, suggestions],
  );

  // The groups of every mode, so the grouping dropdown can annotate its
  // options with what each choice would produce. Installed lists are short —
  // three passes over them cost nothing.
  const groupsByMode = useMemo(
    () => ({
      repo: buildGroups(rows, "repo"),
      time: buildGroups(rows, "time"),
      status: buildGroups(rows, "status"),
      domain: buildGroups(rows, "domain"),
    }),
    [rows],
  );
  const groups = groupsByMode[groupBy];
  const groupOptions = useMemo(
    () =>
      GROUP_OPTIONS.map((option) => ({
        ...option,
        count: groupsByMode[option.value].length,
      })),
    [groupsByMode],
  );

  const renderedGroups = groups.slice(0, visibleCount);
  const allRendered = renderedGroups.length >= groups.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || allRendered) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((c) => Math.min(c + GROUP_CHUNK, groups.length));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [allRendered, groups.length]);

  // The drawer walks the flat grouped list, unwrapped — the same coordinates
  // the groups hand their rows.
  const detailSkills = useMemo(
    () => groups.flatMap((group) => group.items.map((row) => row.view)),
    [groups],
  );
  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let next = 0;
    for (const group of groups) {
      offsets.push(next);
      next += group.items.length;
    }
    return offsets;
  }, [groups]);

  // The drawer's index, derived from the selected name at render time so a
  // regrouping can never leave it pointing at the wrong skill. -1 (the named
  // skill is not in the current answer — removed, or filtered by its own
  // search) reads as closed.
  const selectedIndex = useMemo(() => {
    if (!selectedName) return null;
    const index = detailSkills.findIndex((view) => view.name === selectedName);
    return index === -1 ? null : index;
  }, [selectedName, detailSkills]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-5">
      {/* Toolbar, styled like the store's grouped list: search first, the
          grouping mode and the agent strip clustered on the right. */}
      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={handleSearch} label="搜索 Skill" />

        <div className="ml-auto flex items-center gap-2">
          <AgentAvatarMenu />

          <FilterDropdown
            value={groupBy}
            options={groupOptions}
            onChange={handleGroupBy}
          />
        </div>
      </div>

      {/* The grouped skill list; the modal detail drawer overlays it without
          reflowing it or moving its scroll position. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5">
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
          ) : groups.length === 0 ? (
            <Placeholder
              message={
                query ? `未找到匹配“${query}”的 Skill` : "没有符合条件的 Skill"
              }
            />
          ) : (
            <div
              key={`${query}\u0000${groupBy}\u0000${list.length}`}
              className="flex flex-col gap-3"
            >
              {/* Keyed by the answer's definition, so stale fold states and
                  scroll depth never survive into a differently-shaped list;
                  the skill count rides along because uninstalling reshapes
                  the groups too. */}
              {renderedGroups.map((group, gi) => (
                <GroupSection
                  key={group.meta.key}
                  group={group.meta}
                  index={gi}
                  items={group.items}
                  offset={groupOffsets[gi]}
                  selected={selectedIndex}
                  rowKey={(row) => row.view.name}
                  renderItem={(row, _flatIndex, isSelected) => (
                    <InstalledSkillRow
                      view={row.view}
                      enabled={row.enabled}
                      selected={isSelected}
                      matched={matchedById[row.view.name]}
                      suggestion={row.suggestion}
                      onOpen={() => setSelectedName(row.view.name)}
                    />
                  )}
                />
              ))}
              {/* The sentinel ends the rendered run: while it is on screen
                  the observer above extends the run, so scrolling down keeps
                  revealing groups until the answer is fully mounted. */}
              {!allRendered && <div ref={sentinelRef} aria-hidden="true" />}
            </div>
          )}
        </div>
      </div>

      {/* Same right-side detail drawer the store pages use, told which list
          owns it: the installed surface replaces the store's install CTA with
          the enable switch and shows no registry-only figures. ←/→ walks the
          whole grouped list. Uninstalling from it closes it: this list
          shrinks with the skill, so the same index would land on a different
          one — a swap the reader never asked for. */}
      <SkillDetailDrawer
        skills={detailSkills}
        selected={selectedIndex}
        onSelect={(index) =>
          setSelectedName(
            index == null ? null : detailSkills[index]?.name ?? null,
          )
        }
        onRemoved={() => setSelectedName(null)}
        surface="installed"
      />
    </div>
  );
}
