import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useRepoSections } from "../../hooks/use-repo-sections";
import { useViewMemory } from "../../hooks/use-view-memory";
import { skillKey } from "../../lib/skill-view";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useDestinationView, useListQuery } from "../../hooks/use-list-view";
import { domainFacets, domainsOf } from "../../lib/domain-filter";
import { LIST_SORTS } from "../../lib/list-view";
import { byRepoRank } from "../../lib/registry/repo-rank";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";

import { Button } from "../../components/ui/button";
import { ListToolbar } from "../../components/list-toolbar";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Placeholder } from "../../components/placeholder";
import { SearchResults } from "./search-results";
import { SkillRow } from "./skill-row";
import { RepoCard } from "./repo-card";

/**
 * The skill unit's order: most installed first, then by source and name —
 * so equal figures still read in a stable, traceable order.
 */
const byInstalls = (
  a: { skill: { repo: string; name: string; downloads: number } },
  b: { skill: { repo: string; name: string; downloads: number } },
): number =>
  b.skill.downloads - a.skill.downloads ||
  a.skill.repo.localeCompare(b.skill.repo) ||
  a.skill.name.localeCompare(b.skill.name);

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
 * listing the skills it publishes), or one row per skill. As on the installed
 * list, the sort *is* the whole reading — one control on the list's own first
 * row answers both what the screen is made of and what order it reads in:
 *
 * - **按热度** (the default): one row per skill, most installed first — the
 *   figure every row displays, so the order and the numbers beside it can
 *   never disagree.
 * - **按仓库**: one card per repository, led by the registry's own ranking
 *   (`byRepoRank`, the most-starred repository first), each card's preview
 *   listing its skills most-installed first, and each card stating its own place
 *   in the stack — the cards take the whole row each, so the figure column the
 *   skill unit's rows carry is available here too.
 *
 * The reader searches and scopes either reading from the list's own first row
 * (`ListToolbar`); a search re-answers in relevance order across the whole
 * registry, and the picker and the sort lock while it is live.
 */
export function ExplorePage() {
  const { t } = useTranslation();
  // The page's own scrolling element: the list scrolls inside it, which is also
  // why the browser restores nothing for this page (see `view` below).
  const listRef = useRef<HTMLDivElement | null>(null);

  // Worker progress: the climbing count, the streaming/indexing flags and
  // the retry action for a failed download.
  const stats = useRegistryStats();

  // What the reader is looking for, how the list reads, and which domain they
  // scoped the browse to: all three are shared with the installed list, so they
  // are read from the shared view rather than held here. The shape and the order
  // are two answers again — the store's list is one of skill rows or of
  // repository cards, read in the one order a list of skills can be read in.
  const search = useListQuery("store");
  const {
    scope,
    sort = "popularity",
    unit = "skill",
  } = useDestinationView("store");
  // The filter is a browse control: a search re-orders the whole registry by
  // relevance and ignores the scope (and the filter bar locks while it is
  // live), so the scope is not part of the answer's definition.
  const selectedDomain = scope ?? null;

  // The field is answered as it is typed, the list on the settled word: the
  // question the reader reads while typing is their own, not a half-word they
  // have already committed to.
  const query = useDebouncedValue(search).trim();
  const isSearching = query.length > 0;

  // The answer this page is showing, named by the controls that produced it.
  // The depth below is remembered against it: the controls can re-answer the
  // list without the page ever being unmounted, and a depth revealed for one
  // answer is not a place the reader is at under another.
  const signature = `${query}\u0000${unit}\u0000${sort}\u0000${selectedDomain ?? "all"}`;

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
  // It is both the filter's facet set (a domain, and how many repositories it
  // holds) and, when one is chosen, that domain's own list. A search's answer
  // is not fetched here — the shared search view fetches for itself (see
  // `SearchResults`).
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

  // Every skill the browse answer holds, flattened once: the skill unit reads
  // this list, and the filter's facet counts derive from it. A repository's
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
  // relevance order inside the shared search view instead.
  const activeSkills = useMemo(() => {
    if (unit !== "skill") return [];
    const list = selectedDomain
      ? allSkills.filter((hit) => domainsOf(hit.skill).includes(selectedDomain))
      : allSkills;
    return list.toSorted(byInstalls);
  }, [unit, allSkills, selectedDomain]);

  // Consecutive skills from one repository stay listed where the ranking puts
  // them: one row per skill, whatever its source.
  // The filter's facets for the current unit — repositories per domain, or
  // skills per domain: the two units file the same data differently. Both lead
  // with the biggest domain, ties broken by the taxonomy's own order. A skill
  // rides every domain it belongs to, and one nothing classified holds the
  // 未分类 item — as the repository unit files such a repository, and never
  // under 其他, which is the dataset's own answer.
  const facets = useMemo(() => {
    if (unit === "skill") {
      return domainFacets(allSkills, (hit) => domainsOf(hit.skill));
    }
    return (sectionsData?.sections ?? []).map((section) => ({
      key: section.title,
      count: section.repos.length,
    }));
  }, [unit, allSkills, sectionsData]);

  // What the 全部 item counts: every repository, or every skill.
  const totalCount =
    unit === "skill" ? allSkills.length : (sectionsData?.total ?? 0);

  // A download failure only owns the screen while there is nothing to show;
  // with data on screen (cache / previous source) the error surfaces in the
  // footer count instead of blanking the page.
  const activeError = sectionsError ? sectionsErrorObj : null;
  const failure =
    stats.count === 0 && !stats.complete
      ? (stats.error ??
        (activeError instanceof Error ? activeError.message : null))
      : null;

  // How many entries the browse answer lists, and how many are revealed: one
  // skill, or one repository card.
  const itemCount =
    unit === "skill" ? activeSkills.length : browseRepos.length;
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
  // observer.
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
  // The panel walks the flat skill list of the browse answer, unwrapped: the
  // listed skills in the skill unit, and every skill of the listed repositories
  // in the repository unit. One repository per group means no skill appears
  // twice. A search walks inside the shared search view instead, which owns
  // its own selection and drawer.
  const flatSkills = useMemo(() => {
    if (unit === "skill") return activeSkills.map((hit) => hit.skill);
    return browseRepos.flatMap((group) => group.skills.map((hit) => hit.skill));
  }, [unit, activeSkills, browseRepos]);
  // Anything that re-answers the list resets what only described the old one:
  // the revealed depth (it belongs to the list it was revealed for) and the
  // detail panel (its skill may not be in the new answer at all).
  //
  // The controls are shared with the other list now, so this watches the
  // answer instead of each control; the sort is the unit, so one field covers
  // both switches' old answers.
  //
  // Only a *change* resets: mounting with the answer already in hand is the
  // reader coming back to it, and the depth they left it at is the whole point
  // of the memory above.
  const shownAnswer = useRef(signature);
  useEffect(() => {
    if (shownAnswer.current === signature) return;
    shownAnswer.current = signature;
    setSelected(null);
    setView((v) =>
      v.visibleCount === INITIAL_GROUPS
        ? v
        : { ...v, visibleCount: INITIAL_GROUPS },
    );
  }, [signature, setView]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The list's own first row, and the only row above the answer: the
          field that names what the reader is looking for, the domain picker that
          scopes the browse (全部 clears it), the shape switch, and the sort switch
          that says what order it reads in. All four read and write the shared
          view, so what they leave behind is still here on the way back — and the
          scope and the order lock while a question is live, because a search
          answers by relevance and ignores both. The page hands the row its
          counts and whether the question has settled; the row's own arrangement
          is `ListToolbar`'s to answer. The counts follow the unit the sort
          implies: the repository unit weighs a domain by repositories, the skill
          unit by skills. */}
      <ListToolbar
        destination="store"
        facets={facets}
        total={totalCount}
        sorts={LIST_SORTS.store}
        searching={isSearching}
      />

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
              stays unclipped. */}
          <div
            ref={listRef}
            className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5"
          >
            {failure ? (
              <Placeholder
                message={t("state.loadFailed", { message: failure })}
              >
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    stats.refetch();
                    void refetchSections();
                  }}
                >
                  {t("action.retry")}
                </Button>
              </Placeholder>
            ) : isSearching ? (
              // The search answer: the shared search view's store surface —
              // the registry's own index in the shape on screen, with skills.sh
              // folded below it behind its press. Keyed by the answer's
              // definition, so no stale fold or selection survives into a
              // differently-shaped answer.
              <SearchResults
                key={`${unit}:${query}`}
                unit={unit}
                query={query}
                destination="store"
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
                message={t("state.noSkills")}
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
                  // the same wherever it is found.
                  <ul className={SKILL_ROW_LIST_CLASS}>
                    {activeSkills.slice(0, renderedCount).map((hit, index) => {
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
                    })}
                  </ul>
                ) : (
                  // The repository unit: one flat grid, the browse answer
                  // scoped by the domain filter, in the ranking `byRepoRank`
                  // defines — the most-starred repository first, which is the
                  // figure the card's own bar prints, so the order and the
                  // numbers above it cannot disagree.
                  <ul className={REPO_LIST_CLASS}>
                    {browseRepos.slice(0, renderedCount).map((group, index) => (
                      <RepoCard
                        key={group.key}
                        repo={group.title}
                        stars={group.stars}
                        index={index}
                        skills={group.skills}
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
          prev/next bounds) is shared with the installed page. It walks the
          flat skill list, rendered or not yet rendered. A
          search walks inside the shared search view instead, which owns its
          own drawer. */}
      <SkillDetailDrawer
        skills={flatSkills}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  );
}
