import { useEffect, useMemo, useRef, useState } from "react";
import { Flame, FolderGit2, LayoutGrid } from "lucide-react";

import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useSkillsShSearch } from "../../hooks/use-skills-sh-search";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import {
  SKILL_CARD_SKELETON_CLASS,
  SKILL_LIST_CLASS,
} from "../../lib/skill-list-layout";
import type { GroupBy, GroupCounts } from "../../lib/registry/protocol";
import { Button } from "../../components/ui/button";
import {
  FilterDropdown,
  type FilterOption,
} from "../../components/filter-dropdown";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Placeholder } from "../../components/placeholder";
import { SearchInput } from "../../components/search-input";
import { SkillListRow } from "./skill-list-row";
import { GroupSection } from "./group-section";

/**
 * How many groups mount with the page, and how many more mount each time the
 * reader scrolls the list's sentinel into view. The page has no pagination
 * and every group is expanded — a group's cards are the point of the group —
 * so rendering, not folding, is what paces the list: the first chunk paints
 * with the page, and each scroll-to-bottom extends the run until every group
 * of the answer is on screen.
 */
const INITIAL_GROUPS = 6;
const GROUP_CHUNK = 6;

/** Fold-state and React-key identity of the live skills.sh section. */
const LIVE_GROUP_KEY = "skills-sh";

/**
 * The grouping modes the toolbar offers. Each mode implies its own ordering
 * — groups and the skills inside them — so one choice replaces the old
 * grouping-plus-sort pair. `recency` is reserved in the protocol until the
 * mirror publishes an update time and stays out of the menu.
 */
const GROUP_OPTIONS: Array<FilterOption<GroupBy>> = [
  { value: "repo", label: "按仓库", icon: FolderGit2 },
  { value: "popularity", label: "按热度", icon: Flame },
  { value: "domain", label: "按类型", icon: LayoutGrid },
];

export function ExplorePage() {
  // Search text and grouping mode; any change re-groups the answer because
  // both define what a group is.
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("repo");
  const query = useDebouncedValue(search).trim();

  // Worker progress: the climbing count, the streaming/indexing flags and
  // the retry action for a failed download.
  const stats = useRegistryStats();

  // The whole (filtered) registry grouped by the requested mode, from the
  // registry worker — filtering, ordering and the bucketing all happen
  // there. There is no pagination: the page folds groups instead, and a
  // closed group renders no cards.
  const {
    data: groupsData,
    isLoading,
    isError,
    error,
    refetch: refetchPage,
  } = useRegistryGroups(query, groupBy);

  const groups = groupsData?.groups ?? [];

  // The live skills.sh answer for the same query — the store's second source.
  // It is fetched here rather than inside the registry worker: it is a plain
  // upstream request, not a lookup over the local index, and it must be
  // allowed to answer while the index is still being built.
  const { data: liveData } = useSkillsShSearch(query);

  // A download failure only owns the screen while there is nothing to show;
  // with data on screen (cache / previous source) the error surfaces in the
  // footer count instead of blanking the page.
  const failure =
    stats.count === 0 && !stats.complete
      ? (stats.error ??
        (isError && error instanceof Error ? error.message : null))
      : null;

  // The skeleton stays up until the very first skill arrives; after that the
  // list paints from partial data and grows with the stream.
  const loading =
    isLoading || (groups.length === 0 && stats.count === 0 && !failure);

  // Progressive rendering: only the first `visibleCount` groups are mounted;
  // an IntersectionObserver on the sentinel below the list extends the count
  // while the reader scrolls. It resets with the answer's definition — the
  // handlers below — not with the data, so a streaming snapshot that grows
  // the list never snaps the reader back to the top chunk.
  const [visibleCount, setVisibleCount] = useState(INITIAL_GROUPS);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const renderedGroups = groups.slice(0, visibleCount);
  const allRendered = renderedGroups.length >= groups.length;

  // Re-observing on every extension is what keeps the reveal going while the
  // sentinel still sits in view: observing fires the initial callback with
  // the current intersection, so a bottom edge that stays visible loads the
  // next chunk without a further scroll, until everything is mounted.
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

  // Index into the flattened group skills of the skill shown in the detail
  // panel; null keeps the panel closed. Clicking a row while the panel is
  // open simply swaps the selection, so switching skills never replays the
  // slide-in animation.
  const [selected, setSelected] = useState<number | null>(null);
  // The panel walks the flat skill list over all groups, unwrapped. Depends
  // on the query result, not the derived array: `groups` is a fresh identity
  // whenever the page re-renders, which would recompute this every time.
  const flatSkills = useMemo(
    () => (groupsData?.groups ?? []).flatMap((g) => g.skills.map((h) => h.skill)),
    [groupsData],
  );
  // What the live answer adds: the hits the local answer does not already carry.
  // A live hit is keyed by the same `repo/name` pair the registry keys a skill
  // by, so identity is the whole comparison — a skill the store already lists
  // (with its description, its stars and its SKILL.md) must not appear twice,
  // and one it does not is exactly what this section is for. Lives on the
  // search answer, not on the grouping: the same skills come back whichever
  // mode buckets them.
  const liveSkills = useMemo(() => {
    const indexed = new Set(flatSkills.map((s) => `${s.repo}/${s.name}`));
    return (liveData ?? []).filter((s) => !indexed.has(`${s.repo}/${s.name}`));
  }, [liveData, flatSkills]);
  // Each group's first skill's index in that flat list, handed down so a
  // group's rows speak the same coordinate system as `selected`. Depends on
  // the query result, not the derived array, for the same reason.
  const groupOffsets = useMemo(() => {
    const offsets: number[] = [];
    let next = 0;
    for (const group of groupsData?.groups ?? []) {
      offsets.push(next);
      next += group.skills.length;
    }
    return offsets;
  }, [groupsData]);

  const handleSearch = (q: string) => {
    setSelected(null);
    setVisibleCount(INITIAL_GROUPS);
    setSearch(q);
  };
  const handleGroupBy = (mode: GroupBy) => {
    setSelected(null);
    setVisibleCount(INITIAL_GROUPS);
    setGroupBy(mode);
  };

  // Each mode's option, annotated with how many groups it would produce over
  // the current answer — the figures ride in with the groups data itself, so
  // a search narrows them in step with the list. Until the first answer
  // lands there is nothing to annotate.
  const groupOptions = useMemo(
    () =>
      GROUP_OPTIONS.map((option) => ({
        ...option,
        // The reserved `recency` mode is not offered, so the cast is safe
        // for everything the menu actually shows.
        count: groupsData?.groupCounts[option.value as keyof GroupCounts],
      })),
    [groupsData],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-5">
      {/* Toolbar: search on the left; the grouping mode on the right. One
          choice replaces the old grouping-plus-sort pair — every mode implies
          its own ordering, applied inside the worker. */}
      <div className="mb-4 flex items-center gap-3">
        {/* Search runs on the worker's MiniSearch index, which only exists
            once the whole registry has landed. Before that the field is
            locked, so a query is never answered over a partial registry. */}
        <SearchInput
          value={search}
          onChange={handleSearch}
          label="搜索 Skill"
          disabled={!stats.ready}
          placeholder={stats.ready ? undefined : "索引构建中…"}
        />

        <div className="ml-auto flex items-center gap-2">
          <FilterDropdown
            value={groupBy}
            options={groupOptions}
            onChange={handleGroupBy}
          />
        </div>
      </div>

      {/* The group list; the modal detail drawer overlays it without
          reflowing it or moving its scroll position. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Results. The horizontal padding is sized for the macOS-style
              overlay scrollbar: a hovered (transformed) row is painted over the
              thumb, so the rows need reserved space on the right instead of
              sitting under it. The padding is offset by a matching negative
              margin, so content position and row widths are unchanged while the
              outside-painted ink — the selected ring and the focus outline —
              stays unclipped. The top edge stays flush on purpose: the sticky
              group headers pin exactly there, and any top padding would let
              scrolled cards peek out above them. */}
          <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5">
            {failure ? (
              <Placeholder message={`加载失败：${failure}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    stats.refetch();
                    void refetchPage();
                  }}
                >
                  重试
                </Button>
              </Placeholder>
            ) : loading ? (
              // A viewport's worth of card-shaped skeletons: switching to
              // this page paints its final layout instantly and real cards
              // replace the placeholders as the index streams in (instead of
              // an empty spin that reads as "the page never switched").
              <SkeletonList
                rows={12}
                listClassName={SKILL_LIST_CLASS}
                itemClassName={SKILL_CARD_SKELETON_CLASS}
              />
            ) : groups.length === 0 && liveSkills.length === 0 ? (
              <Placeholder
                message={query ? `未找到匹配“${query}”的 Skill` : "暂无技能"}
              />
            ) : (
              <div
                key={`${query}\u0000${groupBy}`}
                className="flex flex-col gap-3"
              >
                {/* Keyed by the answer's definition, not its data: when the
                    query or grouping mode changes the groups remount, so stale
                    fold states never survive into a differently-shaped
                    list. Streaming invalidations share the definition, so
                    they update the groups in place without resetting what
                    the reader has folded (or how far they have scrolled). */}
                {renderedGroups.map((group, gi) => (
                  <GroupSection
                    key={group.key}
                    group={group}
                    index={gi}
                    items={group.skills}
                    offset={groupOffsets[gi]}
                    selected={selected}
                    rowKey={(hit) => `${hit.skill.repo}/${hit.skill.name}`}
                    renderItem={(hit, flatIndex, isSelected) => (
                      <SkillListRow
                        skill={hit.skill}
                        matched={hit.matched}
                        selected={isSelected}
                        onSelect={() => setSelected(flatIndex)}
                      />
                    )}
                  />
                ))}
                {/* The sentinel ends the rendered run: while it is on screen
                    the observer above extends the run, so scrolling down —
                    or simply having a tall viewport — keeps revealing groups
                    until the answer is fully mounted. */}
                {!allRendered && <div ref={sentinelRef} aria-hidden="true" />}
                {/* The live section closes the list: skills.sh's own search
                    answer for the same query, minus everything the local
                    answer already covers. It is a section rather than rows
                    mixed into the groups because it is a different kind of
                    answer — live, upstream, and without the description and
                    stars an indexed skill carries, which is also why its rows
                    show no popularity figure: blending a real install count
                    with absent stars would understate it. So it neither joins
                    the grouping nor claims a place in the ranking. Its rows are
                    install-only: with no snapshot path there is no SKILL.md to
                    open, and the detail panel has nothing to show. */}
                {liveSkills.length > 0 && (
                  <GroupSection
                    group={{
                      key: LIVE_GROUP_KEY,
                      title: "skills.sh 官方搜索",
                      note: "实时结果，本地索引未收录",
                      ordinal: "plain",
                    }}
                    index={groups.length}
                    items={liveSkills}
                    offset={flatSkills.length}
                    selected={null}
                    rowKey={(skill) => `${skill.repo}/${skill.name}`}
                    renderItem={(skill) => <SkillListRow skill={skill} />}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal detail drawer; the wiring (open/close, prev/next bounds) is
          shared with the featured page. It walks the flat skill list over all
          groups, rendered or not yet rendered. */}
      <SkillDetailDrawer
        skills={flatSkills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
