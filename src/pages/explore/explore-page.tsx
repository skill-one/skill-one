import { useEffect, useMemo, useRef, useState } from "react";

import { useRepoSections } from "../../hooks/use-repo-sections";
import { useRepoCardLimit } from "../../hooks/use-repo-card-limit";
import { useViewMemory } from "../../hooks/use-view-memory";
import { skillKey } from "../../lib/skill-view";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useDestinationView, useListQuery } from "../../hooks/use-list-view";
import { useInstalledSearchRows } from "../../hooks/use-installed-search";
import { domainFacets, domainsOf } from "../../lib/domain-filter";
import { setScope } from "../../lib/list-view";
import { byRepoRank } from "../../lib/registry/repo-rank";
import { FIRST_RANK_BAND, rankBands } from "../../lib/registry/rank-bands";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";

import { CollapsibleSection } from "../../components/collapsible-section";
import { Button } from "../../components/ui/button";
import { ListFacets } from "../../components/list-facets";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Placeholder } from "../../components/placeholder";
import { SkillRow } from "./skill-row";
import { SkillRun, buildSkillRuns, byInstalls } from "./skill-run";
import { RepoCard } from "./repo-card";
import { SearchResults } from "./search-results";

/**
 * How many repository cards mount with the page, and how many more mount each
 * time the reader scrolls the list's sentinel into view. The page has no
 * pagination — rendering, not folding, is what paces the list: the first chunk
 * paints with the page, and each scroll-to-bottom extends the run until every
 * card of the answer is on screen.
 */
const INITIAL_GROUPS = 6;
const GROUP_CHUNK = 6;

/**
 * The explore page's remembered view: how deep the list had been revealed.
 *
 * The controls are not in here any more. They are shared with the installed
 * list (see `lib/list-view`), so what a page alone knows is what a page alone
 * remembers — and `useViewMemory` drops even that once the controls have moved
 * on to another answer.
 */
interface ExploreView {
  visibleCount: number;
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

  // What the reader is looking for, how the list reads, and which domain they
  // scoped the browse to: all three are shared with the installed list, so they
  // are read from the shared view rather than held here.
  const search = useListQuery();
  const { unit, scope } = useDestinationView("store");
  // The filter is a browse control: a search re-orders the whole registry by
  // relevance, so it ignores the filter (and the filter bar stands down).
  const selectedDomain = scope ?? null;

  const query = useDebouncedValue(search).trim();
  const isSearching = query.length > 0;

  // The answer this page is showing, named by the controls that produced it.
  // The depth below is remembered against it: the controls can re-answer the
  // list without the page ever being unmounted, and a depth revealed for one
  // answer is not a place the reader is at under another.
  const signature = `${query}\u0000${unit}\u0000${selectedDomain ?? "all"}`;

  // How deep the list had been revealed, remembered per history entry: a
  // drill-down — into a repository's page and back — unmounts this page, and
  // the depth has to come back with it or the reader is handed a page they were
  // not on.
  //
  // The scroll position waits for content: until the first skill lands the page
  // holds a skeleton, and a position restored into a skeleton is spent on
  // nothing.
  const [view, setView] = useViewMemory<ExploreView>(
    "explore",
    { visibleCount: INITIAL_GROUPS },
    listRef,
    { ready: stats.count > 0, signature },
  );
  const { visibleCount } = view;

  // The browse answer: every repository once, filed under its leading domain.
  // It is both the filter's chip set (a domain, and how many repositories it
  // holds) and, when one is chosen, that domain's own list. A search's answer
  // is not fetched here — the unified search view fetches for itself (see
  // `SearchResults`), so browse and search never fetch together.
  const {
    data: sectionsData,
    isLoading: sectionsLoading,
    isError: sectionsError,
    error: sectionsErrorObj,
    refetch: refetchSections,
  } = useRepoSections(!isSearching);

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

  // The repository answer cut into rank bands (Top 25, 26–50, 51–100, …) for
  // the grid's collapsible headers — null while the answer is short enough to
  // stay one flat grid, since a lone "Top 25" header over the whole answer
  // would be noise. Cut from the full answer, not the revealed prefix: a band
  // the reader has not reached still owns its true count and its range.
  const repoBands = useMemo(
    () =>
      unit === "repo" && browseRepos.length > FIRST_RANK_BAND
        ? rankBands(browseRepos)
        : null,
    [unit, browseRepos],
  );

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

  // The skill unit's browse list: the browse answer by install count, scoped
  // to the chosen domain by membership. A search re-answers this list in
  // relevance order inside the unified search view instead.
  const activeSkills = useMemo(() => {
    if (unit !== "skill") return [];
    const list = selectedDomain
      ? allSkills.filter((hit) => domainsOf(hit.skill).includes(selectedDomain))
      : allSkills;
    return list.toSorted(byInstalls);
  }, [unit, allSkills, selectedDomain]);

  // Consecutive skills from one repository, gathered into runs (see
  // `buildSkillRuns`): a repository that ships several close-ranked skills can
  // show its best and fold the rest behind a single "+N more" row.
  const skillGroups = useMemo(() => buildSkillRuns(activeSkills), [activeSkills]);

  // The filter's chips for the current unit — repositories per domain, or skills
  // per domain: the two units file the same data differently. Both lead with the
  // biggest domain, ties broken by the taxonomy's own order. A skill rides every
  // domain it belongs to, and one nothing classified holds the 未分类 chip — as
  // the repository unit files such a repository, and never under 其他, which is
  // the dataset's own answer.
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

  // A download failure only owns the screen while there is nothing to show;
  // with data on screen (cache / previous source) the error surfaces in the
  // footer count instead of blanking the page.
  const activeError = isSearching ? null : sectionsError
    ? sectionsErrorObj
    : null;
  const failure =
    stats.count === 0 && !stats.complete
      ? (stats.error ??
        (activeError instanceof Error ? activeError.message : null))
      : null;

  // How many entries the browse answer lists, and how many are revealed: one
  // repository card, or one skill run — a repository's consecutive skills fold
  // into a single entry (see `skillGroups`), so the run, not the skill, is what
  // the reveal counts. A search does not reveal — the unified search view
  // renders its whole answer.
  const itemCount =
    unit === "skill" ? skillGroups.length : browseRepos.length;
  const renderedCount = Math.min(visibleCount, itemCount);
  const allRendered = renderedCount >= itemCount;

  // The skeleton stays up until the very first repository arrives; after that
  // the list paints from partial data and grows with the stream.
  const loading =
    sectionsLoading || (itemCount === 0 && stats.count === 0 && !failure);

  // Progressive rendering: only the first `visibleCount` repository cards are
  // mounted; an IntersectionObserver on the sentinel below the list extends the
  // count while the reader scrolls. It resets with the answer's definition —
  // the handlers below — not with the data, so a streaming snapshot that grows
  // the list never snaps the reader back to the top chunk.
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Re-observing on every extension is what keeps the reveal going while the
  // sentinel still sits in view: observing fires the initial callback with
  // the current intersection, so a bottom edge that stays visible loads the
  // next chunk without a further scroll, until everything is mounted. The
  // count is what changes on an extension, so it is what re-arms the
  // observer — a folded band makes this load-bearing: the next chunk mounts
  // inside the folded panel (no visible growth), so the sentinel never
  // leaves the view and only a re-arm can keep the reveal moving.
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
  }, [allRendered, itemCount, renderedCount, setView]);

  // The skill shown in the detail panel, by identity; null keeps the panel
  // closed. Clicking a row while the panel is open simply swaps the selection,
  // so switching skills never replays the slide-in animation.
  const [selected, setSelected] = useState<string | null>(null);
  // Which folds the reader has opened, by the run head's key. The rows a fold
  // hides are still part of the answer — only the rendering changes.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  // The panel walks the flat skill list of the browse answer, unwrapped: the
  // listed skills in the skill unit, and every skill of the listed repositories
  // in the repository unit. One repository per group means no skill appears
  // twice. A search walks inside the unified search view instead, which owns
  // its own selection and drawer.
  const flatSkills = useMemo(() => {
    if (unit === "skill") return activeSkills.map((hit) => hit.skill);
    return browseRepos.flatMap((group) => group.skills.map((hit) => hit.skill));
  }, [unit, activeSkills, browseRepos]);
  // The installed answer the unified search view opens with: the installed
  // index's own hits, render-ready with the store's default action (the
  // install button, which an already-installed row carries as a badge).
  const installedRows = useInstalledSearchRows(query);
  // Anything that re-answers the list resets what only described the old one:
  // the revealed depth (it belongs to the list it was revealed for), the opened
  // folds (a run's head key belongs to the answer that produced it) and the
  // detail panel (its skill may not be in the new answer at all).
  //
  // The controls are shared with the other list now, so this watches the answer
  // instead of each control. Switching the unit still lands here as one change,
  // because the list view drops the scope with the unit (`lib/list-view`).
  //
  // Only a *change* resets: mounting with the answer already in hand is the
  // reader coming back to it, and the depth they left it at is the whole point
  // of the memory above.
  const shownAnswer = useRef(signature);
  useEffect(() => {
    if (shownAnswer.current === signature) return;
    shownAnswer.current = signature;
    setSelected(null);
    setOpenGroups((open) => (Object.keys(open).length === 0 ? open : {}));
    setView((v) =>
      v.visibleCount === INITIAL_GROUPS
        ? v
        : { ...v, visibleCount: INITIAL_GROUPS },
    );
  }, [signature, setView]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The list's own first row: the domains that hold rows, flat, one press
          to scope the list (全部 clears it).
          The chips are a browse control — a search re-orders the whole registry
          by relevance and ignores the scope — so they stand down while a search
          is live, and the list opens the content on its own then.
          Their counts follow the unit: the repository unit weighs a domain by
          repositories, the skill unit by skills. */}
      {!isSearching && (
        <div className="mb-3 flex min-w-0 items-center">
          <ListFacets
            facets={chips}
            total={totalCount}
            selected={selectedDomain}
            onSelect={(key) => setScope("store", key)}
          />
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
                    void refetchSections();
                  }}
                >
                  重试
                </Button>
              </Placeholder>
            ) : isSearching ? (
              // The unified search answer: three sections — what this machine
              // has, what the store carries, what skills.sh answers live — one
              // shared implementation both searchable lists render (see
              // `SearchResults`). Keyed by the answer's definition, so no stale
              // fold or selection survives into a differently-shaped answer.
              <SearchResults
                key={`${unit}:${query}`}
                unit={unit}
                query={query}
                installed={installedRows.map((row) => ({
                  skill: row.skill,
                  matched: row.matched,
                }))}
              />
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
            ) : itemCount === 0 ? (
              <Placeholder
                message={query ? `未找到匹配“${query}”的 Skill` : "暂无技能"}
              />
            ) : (
              <div
                key={`${unit}:${selectedDomain ?? "all"}`}
                className="flex flex-col gap-6"
              >
                {/* Keyed by the browse answer's definition, not its data: when
                    the filter or the unit changes the list remounts, so no
                    stale state survives into a differently-shaped list.
                    Streaming invalidations share the definition, so they
                    update the list in place without resetting how far it was
                    revealed. */}
                {unit === "skill" ? (
                  // The skill unit: one row per skill, in install order — the
                  // same row a repository's own page lists, so a skill reads
                  // the same wherever it is found. A repository whose skills
                  // land in consecutive ranks folds all but the best behind
                  // one row (`SkillRun`), so a prolific repository does not
                  // flood the ranking with near-duplicates.
                  <ul className={SKILL_ROW_LIST_CLASS}>
                    {skillGroups.slice(0, renderedCount).map((group) => {
                      const headKey = skillKey(group.items[0].skill);
                      return (
                        <SkillRun
                          key={headKey}
                          group={group}
                          open={!!openGroups[headKey]}
                          renderRow={(hit, index) => {
                            const key = skillKey(hit.skill);
                            return (
                              <SkillRow
                                key={key}
                                skill={hit.skill}
                                matched={hit.matched}
                                index={index}
                                selected={key === selected}
                                onSelect={() => setSelected(key)}
                              />
                            );
                          }}
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
                ) : repoBands ? (
                  // The repository unit, answer long enough to pace by rank:
                  // one collapsible band per rank range, each carrying the
                  // same card grid, styled like the installed list's time
                  // buckets. Reveal stays global — a band mounts only once the
                  // revealed prefix reaches its first rank, and then with just
                  // the revealed slice — so the sentinel below paces the bands
                  // exactly as it paced the flat grid.
                  <div className="flex flex-col gap-6">
                    {repoBands.map((band) => {
                      const revealed = band.items.slice(
                        0,
                        Math.max(0, renderedCount - (band.start - 1)),
                      );
                      if (revealed.length === 0) return null;
                      return (
                        <CollapsibleSection
                          key={band.key}
                          title={band.title}
                          count={`${band.items.length} 个仓库`}
                        >
                          <ul className={REPO_LIST_CLASS}>
                            {revealed.map((group) => (
                              <RepoCard
                                key={group.key}
                                repo={group.title}
                                stars={group.stars}
                                skills={group.skills}
                                maxSkills={maxSkills}
                                selected={selected}
                                onOpenSkill={setSelected}
                              />
                            ))}
                          </ul>
                        </CollapsibleSection>
                      );
                    })}
                  </div>
                ) : (
                  // The repository unit with a short answer — a small registry
                  // or a domain filter with few repositories: one flat grid,
                  // the browse answer scoped by the domain filter, with no band
                  // header over it.
                  <ul className={REPO_LIST_CLASS}>
                    {browseRepos.slice(0, renderedCount).map((group) => (
                      <RepoCard
                        key={group.key}
                        repo={group.title}
                        stars={group.stars}
                        skills={group.skills}
                        maxSkills={maxSkills}
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
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal detail drawer for the browse answer; the wiring (open/close,
          prev/next bounds) is shared with the my-skills page. It walks the
          flat skill list over all groups, rendered or not yet rendered. A
          search walks inside the unified search view instead, which owns its
          own drawer. */}
      <SkillDetailDrawer
        skills={flatSkills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}

