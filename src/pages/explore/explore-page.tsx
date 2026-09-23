import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, ChevronDown, List } from "lucide-react";

import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useRepoSections } from "../../hooks/use-repo-sections";
import { useRepoCardLimit } from "../../hooks/use-repo-card-limit";
import { useViewMemory } from "../../hooks/use-view-memory";
import { skillKey } from "../../lib/skill-view";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useSkillsShSearch } from "../../hooks/use-skills-sh-search";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { domainLabel, domainMeta } from "../../data/domains";
import { domainFacets, domainsOf } from "../../lib/domain-filter";
import { byRepoRank } from "../../lib/registry/repo-rank";
import { cn, formatCount } from "../../lib/utils";
import type { SearchHit } from "../../lib/registry/protocol";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import { Button } from "../../components/ui/button";
import { DomainChip } from "../../components/domain-chip";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Placeholder } from "../../components/placeholder";
import { SearchInput } from "../../components/search-input";
import { ToggleGroup, ToggleGroupItem } from "../../components/ui/toggle-group";
import { SkillListRow } from "./skill-list-row";
import { SkillRow } from "./skill-row";
import { GroupSection } from "./group-section";
import { RepoCard } from "./repo-card";

/**
 * How many repository cards mount with the page, and how many more mount each
 * time the reader scrolls the list's sentinel into view. The page has no
 * pagination — rendering, not folding, is what paces the list: the first chunk
 * paints with the page, and each scroll-to-bottom extends the run until every
 * card of the answer is on screen.
 */
const INITIAL_GROUPS = 6;
const GROUP_CHUNK = 6;

/** Fold-state and React-key identity of the live skills.sh section. */
const LIVE_GROUP_KEY = "skills-sh";

/** What the list is made of: one repository card each, or one skill row each. */
type Unit = "repo" | "skill";

/** The skill unit's order: most installed first, then by source and name. */
function byInstalls(a: SearchHit, b: SearchHit): number {
  return (
    b.skill.downloads - a.skill.downloads ||
    a.skill.repo.localeCompare(b.skill.repo) ||
    a.skill.name.localeCompare(b.skill.name)
  );
}

/**
 * The smallest run of consecutive skills from one repository worth folding
 * away. A shorter run is listed whole: hiding one or two rows behind a "+N"
 * line trades a plain row for a row plus a press, which costs more than it
 * saves. From four on, the fold earns its keep.
 */
const FOLD_MIN_RUN = 4;

/** A run of consecutive skills from one repository. */
interface SkillGroup {
  /** The repository the run belongs to. */
  repo: string;
  /** The run head's rank (zero-based) in the flat list. */
  start: number;
  /** The run's skills, head first. */
  items: SearchHit[];
  /** The run's total installs, for the fold row's figure. */
  total: number;
}

/**
 * The explore page's remembered view: the controls that have to come back
 * together after a drill-down, plus how deep the list was revealed.
 */
interface ExploreView {
  search: string;
  visibleCount: number;
  /**
   * The domain the list is scoped to, by its key; absent means every domain
   * ("全部"). Absent in entries written before the filter existed.
   */
  domain?: string;
  /**
   * The list's unit. Absent in entries written before the switch existed, and
   * read as `repo` — the page's original shape.
   */
  unit?: Unit;
}

/**
 * The store's browse list, in either of two units: one card per repository (each
 * listing the skills it publishes), or one row per skill. The reader picks the
 * unit on the toolbar, scopes either to a single domain with the filter below,
 * and both share the same selection. There is no sort control: the repository
 * unit leads with the highest-starred repositories (their skills most-installed
 * first) and the skill unit with the most installed skills; a search re-answers
 * either in relevance order across the whole registry, and the filter stands
 * down while it is live.
 */
export function ExplorePage() {
  // The page's own scrolling element: the list scrolls inside it, which is also
  // why the browser restores nothing for this page (see `view` below).
  const listRef = useRef<HTMLDivElement | null>(null);

  // Worker progress: the climbing count, the streaming/indexing flags and
  // the retry action for a failed download.
  const stats = useRegistryStats();

  // How many skills each repository card previews — the reader's choice, set in
  // Settings; a change there re-renders this list live.
  const maxSkills = useRepoCardLimit();

  // What the reader has typed, how deep they had revealed the list, and which
  // domain they scoped the browse to. They live in one object, remembered per
  // history entry, because a drill-down — into a repository's page and back —
  // unmounts this page: all three have to come back together, or the reader is
  // handed a page they were not on.
  //
  // The scroll position waits for content: until the first skill lands the page
  // holds a skeleton, and a position restored into a skeleton is spent on
  // nothing.
  const [view, setView] = useViewMemory<ExploreView>(
    "explore",
    { search: "", visibleCount: INITIAL_GROUPS },
    listRef,
    { ready: stats.count > 0 },
  );
  const { search, visibleCount } = view;
  const query = useDebouncedValue(search).trim();
  const isSearching = query.length > 0;
  // The filter is a browse control: a search re-orders the whole registry by
  // relevance, so it ignores the filter (and the filter bar stands down).
  const selectedDomain = view.domain ?? null;
  // The list's unit — one repository card each, or one skill row each. Absent in
  // entries written before the switch existed, read as `repo`.
  const unit = view.unit ?? "repo";

  // A search's answer: repository groups in relevance order, flat. It is asked
  // only while a search is live — the browse list answers the same repositories
  // another way (see below), so the two never fetch together and duplicate the
  // payload.
  const {
    data: groupsData,
    isLoading: groupsLoading,
    isError: groupsError,
    error: groupsErrorObj,
    refetch: refetchGroups,
  } = useRegistryGroups(query, isSearching);

  const groups = groupsData?.groups ?? [];

  // The browse answer: every repository once, filed under its leading domain.
  // It is both the filter's chip set (a domain, and how many repositories it
  // holds) and, when one is chosen, that domain's own list.
  const {
    data: sectionsData,
    isLoading: sectionsLoading,
    isError: sectionsError,
    error: sectionsErrorObj,
    refetch: refetchSections,
  } = useRepoSections(!isSearching);

  // The live skills.sh answer for the same query — the store's second source.
  // It is fetched here rather than inside the registry worker: it is a plain
  // upstream request, not a lookup over the local index, and it must be
  // allowed to answer while the index is still being built.
  const { data: liveData } = useSkillsShSearch(query);

  // The browse list: the chosen domain's repositories, or — with no filter —
  // every domain's, re-filed into one ranking. A repository's leading domain is
  // unique, so flattening the sections lists each repository exactly once.
  const browseRepos = useMemo(() => {
    const all = sectionsData?.sections ?? [];
    if (selectedDomain) {
      return (
        all.find((section) => section.title === selectedDomain)?.repos ?? []
      );
    }
    return all.flatMap((section) => section.repos).toSorted(byRepoRank);
  }, [sectionsData, selectedDomain]);

  // The list on screen: a search's relevance order, or the browse answer.
  const activeRepos = isSearching ? groups : browseRepos;

  // Every skill the browse answer holds, flattened once: the skill unit reads
  // this list, and the filter's chip counts derive from it. A repository's
  // leading domain is unique, so no skill is listed twice.
  const allSkills = useMemo(
    () =>
      (sectionsData?.sections ?? []).flatMap((section) =>
        section.repos.flatMap((repo) => repo.skills),
      ),
    [sectionsData],
  );

  // The skill unit's list: the browse answer by install count — scoped to the
  // chosen domain by membership — or, under a search, the matches in relevance
  // order, flattened out of their repository groups.
  const activeSkills = useMemo(() => {
    if (unit !== "skill") return [];
    if (isSearching) {
      return (groupsData?.groups ?? []).flatMap((group) => group.skills);
    }
    const list = selectedDomain
      ? allSkills.filter((hit) => domainsOf(hit.skill).includes(selectedDomain))
      : allSkills;
    return list.toSorted(byInstalls);
  }, [unit, isSearching, groupsData, allSkills, selectedDomain]);

  // Consecutive skills from one repository, gathered into runs so a repository
  // that ships several close-ranked skills can show its best and fold the rest
  // behind a single "+N more" row (see `SkillRun`, which decides whether a run
  // is long enough to be worth folding). Only *adjacent* skills form a run: a
  // repository whose skills the ranking separates stays listed where each falls.
  const skillGroups = useMemo(() => {
    const runs: SkillGroup[] = [];
    let index = 0;
    for (const hit of activeSkills) {
      const last = runs.at(-1);
      if (last && last.repo === hit.skill.repo) {
        last.items.push(hit);
        last.total += hit.skill.downloads;
      } else {
        runs.push({
          repo: hit.skill.repo,
          start: index,
          items: [hit],
          total: hit.skill.downloads,
        });
      }
      index += 1;
    }
    return runs;
  }, [activeSkills]);

  // The filter's chips for the current unit — repositories per domain, or skills
  // per domain: the two units file the same data differently. Both lead with the
  // biggest domain, ties broken by the taxonomy's own order. A skill rides every
  // domain it belongs to; an unclassified one pools into the catch-all (as the
  // repository unit files it).
  const chips = useMemo(() => {
    if (unit === "skill") {
      return domainFacets(allSkills, (hit) => domainsOf(hit.skill));
    }
    return (sectionsData?.sections ?? []).map((section) => ({
      key: section.title,
      count: section.repos.length,
    }));
  }, [unit, allSkills, sectionsData]);

  // What the 全部 chip counts: every repository, or every skill.
  const totalCount =
    unit === "skill" ? allSkills.length : (sectionsData?.total ?? 0);
  // What a chip's count counts, named in its tip.
  const countLabel = unit === "skill" ? "个 skill" : "个仓库";

  // A download failure only owns the screen while there is nothing to show;
  // with data on screen (cache / previous source) the error surfaces in the
  // footer count instead of blanking the page.
  const activeError = isSearching
    ? groupsError
      ? groupsErrorObj
      : null
    : sectionsError
      ? sectionsErrorObj
      : null;
  const failure =
    stats.count === 0 && !stats.complete
      ? (stats.error ??
        (activeError instanceof Error ? activeError.message : null))
      : null;

  // How many entries the current answer lists, and how many are revealed: one
  // repository card, or one skill run — a repository's consecutive skills fold
  // into a single entry (see `skillGroups`), so the run, not the skill, is what
  // the reveal counts.
  const itemCount =
    unit === "skill" ? skillGroups.length : activeRepos.length;
  const renderedCount = Math.min(visibleCount, itemCount);
  const allRendered = renderedCount >= itemCount;

  // The skeleton stays up until the very first repository arrives; after that
  // the list paints from partial data and grows with the stream.
  const activeLoading = isSearching ? groupsLoading : sectionsLoading;
  const loading =
    activeLoading || (itemCount === 0 && stats.count === 0 && !failure);

  // Progressive rendering: only the first `visibleCount` repository cards are
  // mounted; an IntersectionObserver on the sentinel below the list extends the
  // count while the reader scrolls. It resets with the answer's definition —
  // the handlers below — not with the data, so a streaming snapshot that grows
  // the list never snaps the reader back to the top chunk.
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Re-observing on every extension is what keeps the reveal going while the
  // sentinel still sits in view: observing fires the initial callback with
  // the current intersection, so a bottom edge that stays visible loads the
  // next chunk without a further scroll, until everything is mounted.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || allRendered) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setView((v) => ({
          ...v,
          visibleCount: Math.min(v.visibleCount + GROUP_CHUNK, itemCount),
        }));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [allRendered, itemCount, setView]);

  // The skill shown in the detail panel, by identity; null keeps the panel
  // closed. Clicking a row while the panel is open simply swaps the selection,
  // so switching skills never replays the slide-in animation.
  const [selected, setSelected] = useState<string | null>(null);
  // Which folds the reader has opened, by the run head's key. The rows a fold
  // hides are still part of the answer — only the rendering changes.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // The panel walks the flat skill list of the active answer, unwrapped: the
  // listed skills in the skill unit, and every skill of the listed repositories
  // in the repository unit. One repository per group means no skill appears
  // twice.
  const flatSkills = useMemo(() => {
    if (unit === "skill") return activeSkills.map((hit) => hit.skill);
    const source = isSearching ? (groupsData?.groups ?? []) : browseRepos;
    return source.flatMap((group) => group.skills.map((hit) => hit.skill));
  }, [unit, activeSkills, isSearching, groupsData, browseRepos]);
  // What the live answer adds: the hits the local answer does not already carry.
  // A live hit is keyed by the same `repo/name` pair the registry keys a skill
  // by, so identity is the whole comparison — a skill the store already lists
  // (with its description, its stars and its SKILL.md) must not appear twice,
  // and one it does not is exactly what this section is for.
  const liveSkills = useMemo(() => {
    const indexed = new Set(flatSkills.map(skillKey));
    return (liveData ?? []).filter((s) => !indexed.has(skillKey(s)));
  }, [liveData, flatSkills]);
  const handleSearch = (q: string) => {
    setSelected(null);
    setOpenGroups({});
    setView((v) => ({ ...v, search: q, visibleCount: INITIAL_GROUPS }));
  };
  // Picking a domain (or 全部) re-answers the list, so the revealed depth resets
  // with it — the same reset a new search gets, and for the same reason: the old
  // depth describes a list that no longer exists. The opened folds reset with it
  // for a like reason: a run's head key belongs to the answer that produced it.
  const handleDomain = (next: string | null) => {
    if (next === selectedDomain) return;
    setSelected(null);
    setOpenGroups({});
    setView((v) => ({
      ...v,
      domain: next ?? undefined,
      visibleCount: INITIAL_GROUPS,
    }));
  };
  // Switching the unit re-answers the list, so the revealed depth resets with it
  // — and so does the domain scope: the two units file domains differently (a
  // repository's leading domain vs a skill's own), so a scope from one may have
  // no meaning in the other.
  const handleUnit = (next: Unit) => {
    if (next === unit) return;
    setSelected(null);
    setOpenGroups({});
    setView((v) => ({
      ...v,
      unit: next,
      domain: undefined,
      visibleCount: INITIAL_GROUPS,
    }));
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-5">
      {/* Toolbar: the search field, and the list's unit out at the far edge.
          Both re-answer the same list, so they share one bar; the domain filter
          below belongs to both units. */}
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
        {/* A segmented control, not a menu: there are exactly two units and
            both are worth naming, so the current one stays legible at a glance
            instead of hiding behind a trigger. */}
        <ToggleGroup
          className="ml-auto shrink-0"
          variant="outline"
          size="lg"
          spacing={0}
          value={[unit]}
          onValueChange={(value) => {
            const next = value[0];
            if (next) handleUnit(next as Unit);
          }}
          aria-label="列表单位"
        >
          <ToggleGroupItem value="repo" className="gap-1.5 px-3">
            <Boxes aria-hidden />
            <span>按仓库</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="skill" className="gap-1.5 px-3">
            <List aria-hidden />
            <span>按技能</span>
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* The domain filter: every domain that holds rows, flat, one press to
          scope the list (全部 clears it). It is a browse control — a search
          re-orders the whole registry by relevance and ignores it — so it stands
          only while browsing. Its chips and their counts follow the unit: the
          repository unit weighs a domain by repositories, the skill unit by
          skills. */}
      {!isSearching && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <DomainChip
            selected={selectedDomain === null}
            count={totalCount}
            countLabel={countLabel}
            expanded
            onClick={() => handleDomain(null)}
          >
            全部
          </DomainChip>
          {chips.map(({ key, count }) => (
            <DomainChip
              key={key}
              selected={selectedDomain === key}
              emoji={domainMeta(key)?.emoji}
              count={count}
              countLabel={countLabel}
              onClick={() => handleDomain(key)}
            >
              {domainLabel(key)}
            </DomainChip>
          ))}
        </div>
      )}

      {/* The list; the modal detail drawer overlays it without reflowing it or
          moving its scroll position. */}
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
          <div
            ref={listRef}
            className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5"
          >
            {failure ? (
              <Placeholder message={`加载失败：${failure}`}>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    stats.refetch();
                    void (isSearching ? refetchGroups() : refetchSections());
                  }}
                >
                  重试
                </Button>
              </Placeholder>
            ) : loading ? (
              // A viewport's worth of card- or row-shaped skeletons, per the
              // unit: switching to this page paints its final layout instantly
              // and real rows replace the placeholders as the index streams in
              // (instead of an empty spin that reads as "the page never
              // switched").
              <SkeletonList
                rows={12}
                listClassName={
                  unit === "skill" ? SKILL_ROW_LIST_CLASS : REPO_LIST_CLASS
                }
                itemClassName={
                  unit === "skill"
                    ? SKILL_ROW_SKELETON_CLASS
                    : REPO_CARD_SKELETON_CLASS
                }
              />
            ) : itemCount === 0 && liveSkills.length === 0 ? (
              <Placeholder
                message={query ? `未找到匹配“${query}”的 Skill` : "暂无技能"}
              />
            ) : (
              <div
                key={`${unit}:${selectedDomain ?? "all"}:${query}`}
                className="flex flex-col gap-6"
              >
                {/* Keyed by the answer's definition, not its data: when the
                    query, the filter or the unit changes the list remounts, so
                    no stale state survives into a differently-shaped list.
                    Streaming invalidations share the definition, so they update
                    the list in place without resetting how far it was revealed. */}
                {unit === "skill" ? (
                  // The skill unit: one row per skill, in install order (or the
                  // search's relevance order) — the same row a repository's own
                  // page lists, so a skill reads the same wherever it is found.
                  // A repository whose skills land in consecutive ranks folds
                  // all but the best behind one row (`SkillRun`), so a prolific
                  // repository does not flood the ranking with near-duplicates.
                  <ul className={SKILL_ROW_LIST_CLASS}>
                    {skillGroups.slice(0, renderedCount).map((group) => {
                      const headKey = skillKey(group.items[0].skill);
                      return (
                        <SkillRun
                          key={headKey}
                          group={group}
                          open={!!openGroups[headKey]}
                          selected={selected}
                          onOpen={setSelected}
                          onToggle={() =>
                            setOpenGroups((prev) => ({
                              ...prev,
                              [headKey]: !prev[headKey],
                            }))
                          }
                        />
                      );
                    })}
                  </ul>
                ) : (
                  // The repository unit: one card per repository, whether the
                  // answer is a search's relevance order or the browse answer
                  // scoped by the domain filter.
                  <ul className={REPO_LIST_CLASS}>
                    {activeRepos.slice(0, renderedCount).map((group) => (
                      <RepoCard
                        key={group.key}
                        repo={group.title}
                        stars={group.stars}
                        skills={group.skills}
                        maxSkills={maxSkills}
                        hasQuery={isSearching}
                        selected={selected}
                        onOpenSkill={setSelected}
                      />
                    ))}
                  </ul>
                )}
                {/* The sentinel ends the rendered run: while it is on screen
                    the observer above extends the run, so scrolling down —
                    or simply having a tall viewport — keeps revealing the
                    cards until the answer is fully mounted. */}
                {!allRendered && <div ref={sentinelRef} aria-hidden="true" />}
                {/* The live section closes the list: skills.sh's own search
                    answer for the same query, minus everything the local
                    answer already covers. It is a section rather than rows
                    mixed into the groups because it is a different kind of
                    answer — live, upstream, and without the classification an
                    indexed skill carries, so its rows show no figure: the card
                    draws facts only for rows the store vouches for. It neither
                    joins the list's ordering nor claims a place in a ranking.
                    Its rows are install-only: with no snapshot path there is no
                    SKILL.md to open, and the detail panel has nothing to
                    show. */}
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
                    selected={selected}
                    rowKey={skillKey}
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

/**
 * One repository's run in the skill unit: its best-ranked skill, and — when the
 * repository ships more than one — a quiet row that folds the rest away.
 *
 * A repository's skills are ranked together (they share a source, so they tend
 * to hold neighbouring installs), and a long run of them would push every other
 * repository down the page for what is, to the reader, one entry. So a run of
 * `FOLD_MIN_RUN` or more leads with its head and states the rest in one line —
 * "+N more from owner/repo", with the run's combined installs — unfolding them
 * in place on a press; a shorter run is listed whole, since hiding one or two
 * rows costs more than it saves. The fold is the reader's own toggle: the hidden
 * rows mount the moment it opens, and they stay part of the answer's detail walk
 * either way.
 *
 * The fold row borrows the row's own rhythm — the ordinal and glyph columns
 * stand empty — so its text starts exactly where every skill name does.
 */
function SkillRun({
  group,
  open,
  selected,
  onOpen,
  onToggle,
}: {
  group: SkillGroup;
  /** Whether the run's hidden skills are unfolded. */
  open: boolean;
  /** The skill shown in the detail panel, by identity. */
  selected: string | null;
  /** Opens a skill's detail panel. */
  onOpen: (key: string) => void;
  /** Folds or unfolds the run's hidden skills. */
  onToggle: () => void;
}) {
  // A run folds only once hiding actually saves rows: below the threshold it is
  // listed whole — head and all — so there is no fold row and nothing to press.
  const foldable = group.items.length >= FOLD_MIN_RUN;
  const hidden = foldable ? group.items.slice(1) : [];
  const shown = open || !foldable ? group.items : group.items.slice(0, 1);
  return (
    <>
      {shown.map((hit, offset) => {
        const key = skillKey(hit.skill);
        return (
          <SkillRow
            key={key}
            skill={hit.skill}
            matched={hit.matched}
            index={group.start + offset}
            selected={key === selected}
            onSelect={() => onOpen(key)}
          />
        );
      })}
      {hidden.length > 0 && (
        <li className="-mt-2 flex flex-col">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            {/* The ordinal and glyph columns, left empty: the fold's text then
                lines up with every skill name above and below it. */}
            <span aria-hidden="true" className="w-6 shrink-0" />
            <span aria-hidden="true" className="size-7 shrink-0" />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">
                {open ? "收起" : `还有 ${hidden.length} 个来自 ${group.repo}`}
              </span>
              {!open && (
                <span className="shrink-0 tabular-nums opacity-70">
                  共 {formatCount(group.total)}
                </span>
              )}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  open && "rotate-180",
                )}
              />
            </span>
          </button>
        </li>
      )}
    </>
  );
}
