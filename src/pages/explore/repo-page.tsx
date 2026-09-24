import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, ExternalLink, Star } from "lucide-react";

import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useListQuery } from "../../hooks/use-list-view";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useRegistryStats } from "../../hooks/use-registry-stats";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import type { Destination } from "../../lib/list-view";
import { openExternal } from "../../lib/open-external";
import { buildSearchIndex } from "../../lib/search-index";
import {
  installedSkillView,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import {
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import type { InstalledSkill } from "../../lib/skills-manager";
import { formatCount } from "../../lib/utils";
import { DrillDownHead } from "../../components/drill-down-head";
import { OwnerAvatar } from "../../components/owner-avatar";
import { Placeholder } from "../../components/placeholder";
import { RepoEnableSwitch } from "../../components/repo-enable-switch";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { Button } from "../../components/ui/button";
import { SkillRow, type SkillMatched } from "./skill-row";

/** How many card-shaped placeholders stand in while the index streams in. */
const SKELETON_ROWS = 8;

/**
 * One row the page lists: the skill view, the surface it wears (the installed
 * list's enable switch versus the store's install CTA), and — for a row that
 * answered the search — the terms to highlight.
 */
interface RepoRow {
  skill: SkillView;
  /** Store chrome (`false`, install CTA) or installed chrome (`true`, switch). */
  installed: boolean;
  /** Search-hit highlights; absent outside the matches section. */
  matched?: SkillMatched;
}

/**
 * How many rows mount with the page, and how many more each scroll-to-bottom
 * reveals. A repository can publish hundreds of skills and has no pagination,
 * so rendering — not folding — is what paces the list: the first chunk paints
 * with the page, and each scroll extends the run until the whole repository is
 * mounted.
 */
const INITIAL_ROWS = 12;
const ROW_CHUNK = 12;

/**
 * One repository's page: every skill it publishes, or — in the installed list's
 * own reading of it — only the ones already on disk.
 *
 * This is what a repository card's head and tail hand over to, in either list.
 * The card is a summary — a bounded list of a repository's leaders plus a count
 * of what it left out — and it is the wrong surface for the question "what else
 * does this repository have?", which is a list of one repository's own skills
 * and nothing else on screen. So the page is exactly that: the repository's
 * identity at the top, then its skills as one numbered list — a row each,
 * revealed a chunk at a time as the reader scrolls — with the detail panel
 * walking only this repository's skills.
 *
 * `origin` is the list the reader came from, and it decides what the page
 * means:
 *
 * - **from the store**, the repository *is* its catalogue: everything it
 *   publishes is listed, uncapped and unfiltered, and the rows install;
 * - **from the installed list**, the repository is a drawer of things already
 *   taken home: the page opens on the skills that are on disk — the enable
 *   switch in every row, the disabled ones dimmed — and the rest of the
 *   catalogue stays below a dividing line between the two readings, folded
 *   until the reader presses the line. The installs never move and never
 *   change voice: the line is a fold for the second reading, not a swap of the
 *   first one — unfold it and the installs still read first, exactly as they
 *   did, with the catalogue continuing beneath them; fold it back and the
 *   page is the installed list again.
 *
 * The installed reading puts the card bar's one-shot switch in its own head
 * too: what the card governs in one press from the list, the head governs in
 * the same press from inside the repository. Individual switches stay on the
 * rows — which is what the card sent the reader here for.
 *
 * The installed reading is what keeps the two lists telling one story: the card
 * said "these of them are on your machine", and the page it opens says the same
 * thing at full length, with the rest one deliberate step away rather than
 * mixed into what the reader already has.
 *
 * It reads its data out of the queries the explore list already runs
 * (`useRegistryGroups("")` and, while a search is live, the query's own
 * answer), which the query cache has therefore usually answered already:
 * arriving from a card costs no request at all.
 *
 * A search that led the reader here narrows the page the same way it narrowed
 * the card they pressed: the matching skills open on top, in the answer's own
 * order and with their matches highlighted, exactly the rows the card showed,
 * and the repository's other skills wait below a dividing rule of the same
 * kind as the installed reading's catalogue fold. The matches never move: the
 * rule is a fold for the rest, not a swap of the answer — unfold it and the
 * matches still read first, with the repository continuing beneath them. In
 * the installed reading that first fold widens *within the installs*; the
 * catalogue keeps its own fold, nested one step deeper, so a reader who
 * searched first widens to the rest of what they have and only then meets the
 * uninstalled catalogue. A query this repository does not answer widens to the
 * ordinary page rather than opening on an empty matches section.
 *
 * Until the index says it is complete, a repository that is not (yet) in the
 * answer is a repository the stream has not reached: the page holds a skeleton,
 * the same as the list it came from. Only once the index is complete does an
 * absent repository mean what it says — the dataset does not carry it. The
 * installed reading still lists what is on disk in that case, since what is on
 * disk is its own fact and not the index's to state.
 */
export function RepoPage({
  origin = "store",
}: {
  /** The list this page was opened from; see the note above. */
  origin?: Destination;
}) {
  // The repository is the route's splat rather than a path parameter: it is
  // `owner/repo`, and it carries a slash of its own.
  const repo = useParams()["*"] ?? "";
  const { t } = useTranslation();

  const stats = useRegistryStats();
  const { data } = useRegistryGroups("");
  const group = data?.groups.find(
    (candidate) => candidate.key === `repo-${repo}`,
  );
  // What the repository publishes, most-installed first — the store's own
  // answer, which is also the installed reading's second half.
  const published = useMemo(
    () => (group?.skills ?? []).map((hit) => hit.skill),
    [group],
  );

  // The installed reading, in the same two facts the installed list groups by:
  // the on-disk records, and the ledger that places them in a repository. Both
  // queries are shared with the rest of the app (see `use-installed-skills`),
  // so the store's own page pays nothing for them being read here.
  const fromInstalled = origin === "installed";
  const { data: installed, isPending: readingDisk } = useInstalledSkills();
  const { data: provenance, isPending: readingLedger } = useSkillProvenance();
  const linked = provenance?.linked;

  // The installs the ledger places in this repository, by skill name — the
  // same association the installed list's cards are grouped by, so the page a
  // card opens cannot disagree with the card about what belongs to it.
  const records = useMemo(() => {
    const placed = new Map<string, InstalledSkill>();
    if (!fromInstalled) return placed;
    for (const record of installed ?? []) {
      if (linked?.[record.name]?.repo === repo) placed.set(record.name, record);
    }
    return placed;
  }, [fromInstalled, installed, linked, repo]);

  // What is on disk, in the repository's own order, plus any install the index
  // no longer publishes — a skill the reader has does not disappear from the
  // repository it came from just because the store moved on. Each row is the
  // shared installed view, so it carries the store facts the registry entry
  // holds (classification, install count) exactly as the installed list's rows
  // do.
  const onDisk = useMemo<SkillView[]>(() => {
    if (!fromInstalled) return [];
    const listed = published.flatMap((skill) => {
      const record = records.get(skill.name);
      return record ? [installedSkillView(record, linked, skill)] : [];
    });
    const named = new Set(listed.map((skill) => skill.name));
    const unpublished = Array.from(records.values())
      .filter((record) => !named.has(record.name))
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((record) => installedSkillView(record, linked));
    return [...listed, ...unpublished];
  }, [fromInstalled, published, records, linked]);

  // What the repository publishes but this machine does not have — the
  // installed reading's second half, kept out of the list until the reader
  // unfolds it. With none, the installs are the whole repository (barring an
  // install the index no longer publishes, which the first half already
  // shows), and the dividing line would fold nothing.
  const rest = useMemo(
    () =>
      fromInstalled
        ? published.filter((skill) => !records.has(skill.name))
        : [],
    [fromInstalled, published, records],
  );
  const hasRest = rest.length > 0;

  // The search the reader came here with. The search box is one control shared
  // by both lists (see `lib/list-view`), so a query that opened a repository
  // card is still live on the page the card opens — and that page answers it
  // the same way the card did rather than silently widening back to the whole
  // repository.
  const search = useListQuery();
  const query = useDebouncedValue(search).trim();
  const searching = query.length > 0;

  // The store's own answer to that query, shared with the explore list (the
  // query observer dedupes, so arriving from a search costs no request). It is
  // the matches section's source in the store reading.
  const { data: searchData } = useRegistryGroups(query, searching);
  const searchGroup = useMemo(
    () =>
      searching
        ? (searchData?.groups.find(
            (candidate) => candidate.key === `repo-${repo}`,
          ) ?? null)
        : null,
    [searching, searchData, repo],
  );

  // The installed reading answers the same query over what is on disk, with
  // the same index the installed list uses: the page a card opens cannot match
  // differently than the card did.
  const diskSearch = useMemo(
    () => (fromInstalled ? buildSearchIndex([...records.values()]) : null),
    [fromInstalled, records],
  );
  const diskHits = useMemo(
    () => (searching && diskSearch ? diskSearch(query) : null),
    [searching, diskSearch, query],
  );

  // The matches section, in the answer's own order (relevance), when a search
  // is live and this repository answers it. A query it does not answer widens
  // to the ordinary page: an empty matches section would read as a dead end.
  const matchedStore = useMemo<RepoRow[] | null>(() => {
    if (fromInstalled || !searching || !searchGroup) return null;
    const rows: RepoRow[] = searchGroup.skills.map((hit) => ({
      skill: hit.skill,
      matched: hit.matched,
      installed: false,
    }));
    return rows.length > 0 ? rows : null;
  }, [fromInstalled, searching, searchGroup]);

  const matchedDisk = useMemo<RepoRow[] | null>(() => {
    if (!fromInstalled || !diskHits) return null;
    const byName = new Map(onDisk.map((skill) => [skill.name, skill]));
    const rows: RepoRow[] = [];
    for (const hit of diskHits) {
      const skill = byName.get(hit.doc.name);
      if (skill) rows.push({ skill, matched: hit.matched, installed: true });
    }
    return rows.length > 0 ? rows : null;
  }, [fromInstalled, diskHits, onDisk]);

  // The page reads as up to three ordered sections:
  //
  // 1. `first` — the matches in the answer's order when a search is live, or
  //    the ordinary reading (the catalogue whole in the store, the installs in
  //    the installed list) when it is not;
  // 2. `second` — what the search ruled out, folded behind the first dividing
  //    rule (the store's remaining catalogue; the installed reading's other
  //    installs);
  // 3. `third` — the installed reading's uninstalled catalogue, folded behind
  //    its own rule, nested one step inside the search fold so a reader who
  //    searched widens within what they have before meeting the catalogue.
  const first = useMemo<RepoRow[]>(
    () =>
      fromInstalled
        ? (matchedDisk ?? onDisk.map((skill) => ({ skill, installed: true })))
        : (matchedStore ??
          published.map((skill) => ({ skill, installed: false }))),
    [fromInstalled, matchedDisk, matchedStore, onDisk, published],
  );

  const second = useMemo<RepoRow[] | null>(() => {
    const matches = fromInstalled ? matchedDisk : matchedStore;
    if (!matches) return null;
    const names = new Set(matches.map((row) => row.skill.name));
    const source = fromInstalled ? onDisk : published;
    const rows: RepoRow[] = source
      .filter((skill) => !names.has(skill.name))
      .map((skill) => ({ skill, installed: fromInstalled }));
    return rows.length > 0 ? rows : null;
  }, [fromInstalled, matchedDisk, matchedStore, onDisk, published]);

  const third = useMemo<RepoRow[] | null>(
    () =>
      fromInstalled && hasRest
        ? rest.map((skill) => ({ skill, installed: false }))
        : null,
    [fromInstalled, hasRest, rest],
  );

  // The folds are the page's own state, not the shared list view's: they fold
  // this repository, nothing wider. Both stand down when the question changes —
  // another query, or a different repository — because a fold opened for one
  // answer is not a place the reader stands under the next.
  const [secondOpen, setSecondOpen] = useState(false);
  const [thirdOpen, setThirdOpen] = useState(false);
  const questionKey = `${repo}\u0000${query}`;
  const lastQuestion = useRef(questionKey);
  useEffect(() => {
    if (lastQuestion.current === questionKey) return;
    lastQuestion.current = questionKey;
    setSecondOpen(false);
    setThirdOpen(false);
  }, [questionKey]);

  // Which folded sections are mounted. The catalogue fold (third) is nested in
  // the search fold (second): with the search fold present, its rule only
  // stands after the reader widens within what they have; with no search fold
  // it stands where it always did, directly under the installs.
  const secondSection = secondOpen ? second : null;
  const showThirdRule = third != null && (second == null || secondOpen);
  const thirdSection = thirdOpen && showThirdRule ? third : null;

  // One reveal paces the page across whichever sections are mounted: folded,
  // the count runs through the first section alone; a fold open runs it on into
  // that section, numbering continuing rather than restarting. `resetKey`
  // re-seeds it when the question, a fold, or the repository itself changes.
  const total =
    first.length + (secondSection?.length ?? 0) + (thirdSection?.length ?? 0);
  const { count, sentinelRef, done } = useProgressiveReveal({
    total,
    initial: INITIAL_ROWS,
    step: ROW_CHUNK,
    resetKey: `${questionKey}\u0000${secondSection ? "more" : "match"}\u0000${thirdSection ? "rest-open" : "rest-folded"}\u0000${fromInstalled ? "installed" : "store"}`,
  });
  const firstShownRows = first.slice(0, count);
  const secondShownRows = secondSection
    ? secondSection.slice(0, Math.max(0, count - first.length))
    : [];
  const thirdStart = first.length + (secondSection?.length ?? 0);
  const thirdShownRows = thirdSection
    ? thirdSection.slice(0, Math.max(0, count - thirdStart))
    : [];

  const [selected, setSelected] = useState<string | null>(null);

  // Nothing to show yet: either the stream has not reached this repository, or
  // the download failed before it could serve anything (the explore page draws
  // the same line between the two).
  const failure = stats.count === 0 && !stats.complete ? stats.error : null;
  // The index has spoken about this repository and does not carry it.
  const absent = group == null && stats.ready && failure == null;
  // The installed reading's own two facts, still being read: a list that has
  // not read the disk yet is not an empty one, and saying so would be a lie the
  // reader sees for a frame before the installs arrive.
  const reading = fromInstalled && (readingDisk || readingLedger);
  // Nothing to show yet — the stream simply has not said. The installed reading
  // waits for it too: its rows lean on the registry entry for their store
  // facts, and it needs the repository's full count to offer the rest.
  const waiting = reading || (group == null && !absent);

  // What an empty page means: in the installed reading it is a repository with
  // nothing on disk *and* nothing left to unfold (when there is more, the fold
  // is the page's content instead); in the store's reading it is one the
  // completed index does not carry.
  const emptyMessage = absent
    ? t("state.repoNotInIndex", { repo })
    : t("state.repoNoInstalled");
  const isEmpty =
    (!fromInstalled && published.length === 0) ||
    (fromInstalled && onDisk.length === 0 && !hasRest);

  // The head's figure: the published total in the store's reading, the count on
  // disk in the installed one — the same number the card's bar stated — and it
  // does not move when a fold opens: each fold states its own count.
  const headCount = fromInstalled
    ? t("state.installedCount", { count: onDisk.length })
    : t("state.skillCount", { count: published.length });

  // The drawer walks the rows on screen, and the panel's chrome follows the
  // section the open skill belongs to: an installed row offers the enable
  // switch, a folded-out row the store's install CTA.
  const drawerSkills = [
    ...first,
    ...(secondSection ?? []),
    ...(thirdSection ?? []),
  ].map((row) => row.skill);
  const ownedKeys = new Set(onDisk.map((skill) => skillKey(skill)));
  const drawerSurface =
    !fromInstalled || (selected != null && !ownedKeys.has(selected))
      ? "store"
      : "installed";

  // One row in whichever section mounted it, with that section's own chrome:
  // the enable switch and dimming for installs, the store's install CTA for
  // everything folded out.
  const renderRow = (row: RepoRow, index: number) => {
    const record = records.get(row.skill.name);
    return (
      <SkillRow
        key={skillKey(row.skill)}
        skill={row.skill}
        matched={row.matched}
        index={index}
        selected={skillKey(row.skill) === selected}
        muted={row.installed && record?.enabled === false}
        action={
          row.installed ? <SkillEnableSwitch skill={row.skill} /> : undefined
        }
        // The page's head already names the repository, so its rows do not
        // repeat it on every line.
        showSource={false}
        onSelect={() => setSelected(skillKey(row.skill))}
      />
    );
  };

  const [owner] = repo.split("/");

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The page's head: the way back to the list it was opened from, and the
          repository's identity in the same voice as the card's head — who
          published it, what it is called, and the two figures the card showed
          there as well (see `DrillDownHead`).

          The two readings differ in one word of the fallback: the store's page
          goes back to the store, the installed list's to the installed list.
          That is what `origin` buys beyond the rows — a page that pops to the
          list it was opened from rather than to the one it happens to share a
          component with. */}
      <DrillDownHead
        back={fromInstalled ? "/my-skills" : "/explore"}
        avatar={
          <OwnerAvatar owner={owner} className="size-10 shrink-0 text-base" />
        }
        title={repo}
        meta={
          <>
            {group?.stars !== undefined && (
              <>
                <Star
                  className="h-3 w-3 fill-amber-400 text-amber-400"
                  aria-hidden
                />
                {t("common.stars", { count: formatCount(group.stars) })}
                <span aria-hidden="true">·</span>
              </>
            )}
            <span>{headCount}</span>
          </>
        }
        action={
          <>
            {/* The installed reading carries the card bar's same one-shot
                switch into the page: the whole repository's installs, in one
                press, from the head as well as from the list the reader came
                from. The store's reading installs rather than enables, so it
                carries nothing here. */}
            {fromInstalled && onDisk.length > 0 && (
              <RepoEnableSwitch
                names={onDisk.map((skill) => skill.name)}
                label={repo}
              />
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void openExternal(`https://github.com/${repo}`)}
              className="shrink-0"
            >
              <ExternalLink />
              {t("action.openOnGitHub")}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5">
        {failure ? (
          <Placeholder message={t("state.loadFailed", { message: failure })}>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={stats.refetch}
            >
              {t("action.retry")}
            </Button>
          </Placeholder>
        ) : waiting ? (
          <SkeletonList
            rows={SKELETON_ROWS}
            listClassName={SKILL_ROW_LIST_CLASS}
            itemClassName={SKILL_ROW_SKELETON_CLASS}
          />
        ) : isEmpty ? (
          <Placeholder message={emptyMessage} />
        ) : (
          <>
            {/* The first section: the matches when a search led here, or the
                ordinary reading (the catalogue whole / the installs). These
                rows never move or change voice when a fold below opens — the
                whole point of folding rather than swapping. */}
            {firstShownRows.length > 0 && (
              <ul className={SKILL_ROW_LIST_CLASS}>
                {firstShownRows.map((row, index) => renderRow(row, index))}
              </ul>
            )}

            {/* The search fold: the repository's skills the query ruled out,
                drawn as a dividing rule across the list — the matches end
                where the rule begins, and the rest begins where it ends. The
                catalogue fold (if any) is nested inside this one rather than
                stacked under it: widen within the matches first. */}
            {second != null && (
              <div className={firstShownRows.length > 0 ? "py-4" : "pt-1"}>
                <RepoFoldRule
                  controls="repo-other-skills"
                  open={secondOpen}
                  closedLabel={
                    fromInstalled
                      ? t("repo.showOtherInstalled", { count: second.length })
                      : t("repo.showOther", { count: second.length })
                  }
                  openLabel={
                    fromInstalled
                      ? t("repo.collapseOtherInstalled", {
                          count: second.length,
                        })
                      : t("repo.collapseOther", { count: second.length })
                  }
                  onToggle={() => {
                    setSecondOpen((open) => !open);
                    // Folding the search fold also folds the catalogue nested
                    // in it; opening never auto-opens that further fold.
                    setThirdOpen(false);
                  }}
                />
              </div>
            )}
            {secondSection && secondShownRows.length > 0 && (
              <ul id="repo-other-skills" className={SKILL_ROW_LIST_CLASS}>
                {secondShownRows.map((row, i) =>
                  renderRow(row, first.length + i),
                )}
              </ul>
            )}

            {/* The catalogue fold — the installed reading's uninstalled skills
                — in the same voice it had before searches existed. Under a
                search it only stands once the search fold is open, so the two
                rules never stack over an empty list. */}
            {showThirdRule && third != null && (
              <div
                className={
                  first.length + (secondSection?.length ?? 0) > 0
                    ? "py-4"
                    : "pt-1"
                }
              >
                <RepoFoldRule
                  controls="repo-rest-skills"
                  open={thirdOpen}
                  closedLabel={t("repo.showOtherUninstalled", {
                    count: third.length,
                  })}
                  openLabel={t("repo.collapseUninstalled", {
                    count: third.length,
                  })}
                  onToggle={() => setThirdOpen((open) => !open)}
                />
              </div>
            )}
            {thirdSection && thirdShownRows.length > 0 && (
              <ul id="repo-rest-skills" className={SKILL_ROW_LIST_CLASS}>
                {thirdShownRows.map((row, i) => renderRow(row, thirdStart + i))}
              </ul>
            )}

            {/* The sentinel ends the rendered run: while it is on screen the
                observer extends the run, so scrolling down — or simply having
                a tall viewport — keeps revealing rows until every mounted
                section is fully mounted. */}
            {!done && <div ref={sentinelRef} aria-hidden="true" />}
          </>
        )}
      </div>

      {/* The panel walks the rows on screen, so prev/next stays inside this
          repository — and inside the fold: a folded catalogue is not part of
          the walk. The chrome follows the half the open skill stands in: the
          installed half offers the enable switch, the folded-out half the
          store's install and remove. */}
      <SkillDetailDrawer
        skills={drawerSkills}
        selected={selected}
        onSelect={setSelected}
        surface={drawerSurface}
      />
    </div>
  );
}

/**
 * A fold between two sections of one repository, drawn as a rule across the
 * list rather than a button beneath it: one section ends where the rule
 * begins, the next begins where it ends. One press unfolds the next section
 * beneath; a second folds it away again, and the rule stays exactly where it
 * was. The two hairlines flank the rule's own label, which states exactly what
 * unfolding adds.
 */
function RepoFoldRule({
  controls,
  open,
  closedLabel,
  openLabel,
  onToggle,
}: {
  /** The folded list this rule governs (for `aria-controls`). */
  controls: string;
  /** Whether the section it folds is currently mounted. */
  open: boolean;
  /** The rule's label while the section is folded away. */
  closedLabel: string;
  /** The rule's label while the section is unfolded. */
  openLabel: string;
  /** Toggle the fold. */
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
      className="group flex w-full items-center gap-3 rounded-md px-1 py-1 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="h-px flex-1 bg-border transition-colors group-hover:bg-foreground/30"
      />
      <span className="flex shrink-0 items-center gap-1.5">
        {open ? (
          <>
            <ChevronUp className="size-3.5" aria-hidden />
            {openLabel}
          </>
        ) : (
          <>
            <ChevronDown className="size-3.5" aria-hidden />
            {closedLabel}
          </>
        )}
      </span>
      <span
        aria-hidden
        className="h-px flex-1 bg-border transition-colors group-hover:bg-foreground/30"
      />
    </button>
  );
}
