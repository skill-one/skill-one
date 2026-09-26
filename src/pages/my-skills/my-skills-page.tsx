import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ParseKeys, TFunction } from "i18next";
import { Boxes, Users } from "lucide-react";

import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useDestinationView, useListQuery } from "../../hooks/use-list-view";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useRepoCardLimit } from "../../hooks/use-repo-card-limit";
import {
  installedSkillView,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import { domainFacets, domainsOf } from "../../lib/domain-filter";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { SearchResults } from "../explore/search-results";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { Placeholder } from "../../components/placeholder";
import { errorMessage, formatDayHeading } from "../../lib/utils";
import { buildSearchIndex } from "../../lib/search-index";
import { setQuery, setScope } from "../../lib/list-view";
import type { SkillMatched } from "../../components/skill-card";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { RepoEnableSwitch } from "../../components/repo-enable-switch";
import { SkillRow } from "../explore/skill-row";
import {
  groupByInstallTime,
  compareByInstalledTime,
  newestInstallTime,
  type TimeGroup,
} from "../../lib/time-groups";
import { GroupSection } from "../../components/group-section";
import { SkeletonList } from "../../components/skeleton-list";
import { ListFacets } from "../../components/list-facets";
import { LinkSuggestionBadge } from "./link-suggestion-badge";
import type { LinkCandidate } from "../../lib/link-suggestions";
import { RepoCard } from "../explore/repo-card";

/**
 * How many repository cards mount with the page, and how many more mount each
 * time the reader scrolls the list's sentinel into view — the same progressive
 * pacing the store's lists use.
 */
const INITIAL_CARDS = 6;
const CARD_CHUNK = 6;

/** Placeholder cards while the on-disk list is first read. */
const SKELETON_CARDS = 8;

/** Placeholder rows while the on-disk list is first read, in the skill unit. */
const SKELETON_ROWS = 12;

/** React-key identity of the pool card: skills no recorded source vouches for. */
const LOCAL_POOL_KEY = "local";

/** Where the pool card's bar leads: the page that lists the pool whole. */
const LOCAL_POOL_PATH = "/my-skills/local";

/**
 * Where a repository card's bar leads: that repository as *this* list reads it
 * — the skills of it that are on disk — rather than the store's full catalogue
 * of the same repository (`/repo/owner/repo`), which is one deliberate step
 * further from there (see `RepoPage`).
 */
const REPO_PAGE_PATH = "/my-skills/repo/";

/** One installed skill, precomputed where the list is built. */
interface Row {
  skill: SkillView;
  enabled: boolean;
  suggestion?: LinkCandidate[];
  /** Search-hit highlights, so a searched name reads like the store's. */
  matched?: SkillMatched;
}

/** One card's worth of installs: a repository, or the source-less pool. */
interface RepoGroup {
  /** `owner/repo`, or "" for the pool of skills no source vouches for. */
  repo: string;
  items: Row[];
}

/**
 * The stars a card's bar shows: the registry's figure, and only when the card's
 * source resolved to a store entry. An install the registry cannot place has no
 * figure to state, which is not the same as a figure of zero. The figure is
 * read from whichever row resolved — the card files by its newest install, so
 * that row is no longer necessarily the one the registry placed.
 */
function starsOf(group: RepoGroup): number | undefined {
  const backed = group.items.find((row) => row.skill.storeBacked);
  return backed ? backed.skill.stars : undefined;
}

/**
 * The installed list — the management counterpart of the store's 全部 page, in
 * the same two units, switched on the toolbar exactly as the store's are:
 *
 * - **按仓库**: one card per source repository, filed newest-first into the
 *   same relative-time groups as the skill unit — a repository sits in the
 *   bucket its *newest* install belongs to, so a card reading 今天 has
 *   something new in it — and listing that repository's installed skills in
 *   the same newest-first order (up to the preview size set in Settings, 5 by
 *   default; that newest install is therefore always inside the preview).
 *   Installs no recorded source vouches for have no repository to belong to,
 *   so they pool into one card of their own rather than inventing one — the
 *   same shape, with its bar stating 本地安装 in place of a repository it
 *   would have to make up, and opening the page that lists the pool whole.
 * - **按技能**: one row per install, filed newest-first into per-day
 *   groups — 今天 / 昨天, then one dated group per calendar day (09-15,
 *   a day of another year carrying the year), with installs no
 *   timestamp vouches for pooled last under 时间未知 (see
 *   `lib/time-groups`) — so "what did I add lately" reads top to bottom.
 *   Either unit's search re-answers it in relevance order and stands the
 *   groups down. Nothing caps the skill rows: that unit is the whole list, so
 *   the unit that reads it one skill at a time reads all of them.
 *
 * What the page adds to the store's surfaces is what only an installed skill
 * has: enablement — as one group switch on each repository card's bar (a press
 * enables or disables every skill of that card; a mixed card reads as half on)
 * rather than one switch per row, since per-skill switching waits one level
 * deeper, on the repository's own page — the dimming of a disabled row, and the
 * migration badge beside an install whose source the ledger cannot vouch for.
 * The skill unit carries its per-row switch, and both units feed the same
 * detail drawer, so what a skill looks like never depends on how the list is
 * grouped.
 */

/**
 * The header a time group renders: a named day (今天 / 昨天 / 时间未知)
 * speaks its i18n key, a dated day reads as a number (09-15; another year
 * carries the year, 2025-12-03 — see `formatDayHeading`). `titleKey` null is
 * exactly `start` set, so the pair never half-applies.
 */
function groupHeading<T>(
  group: TimeGroup<T>,
  t: TFunction<"translation", undefined>,
): string {
  return group.titleKey
    ? t(group.titleKey as ParseKeys)
    : formatDayHeading(group.start ?? 0);
}

export function MySkillsPage() {
  const { t } = useTranslation();
  const { data: skills, isLoading, isError, error } = useInstalledSkills();

  // Install sources recorded by this app (the provenance ledger), reconciled
  // against the on-disk list on every fetch. Absent entries mean "installed
  // by another tool" — those keep the local-install presentation, and if the
  // registry has plausible namesakes the row offers a confirmable link.
  const { data: provenanceState } = useSkillProvenance();
  const linked = provenanceState?.linked;
  const suggestions = provenanceState?.suggestions;

  // The registry entries behind those recorded sources, keyed by skill name:
  // the store facts an on-disk record never carries (classification, the
  // install count), so the installed list can show the store's card for
  // the skills the ledger placed. Empty for tool installs — nothing to resolve.
  const storeEntries = useInstalledStoreEntries(linked);

  // How many rows a card lists before its bar is the only way to the rest — the
  // reader's own choice, shared with the store's cards.
  const maxSkills = useRepoCardLimit();

  const list = useMemo(() => skills ?? [], [skills]);

  // What the reader is looking for, how the list reads, and which
  // classification they scoped it to: all three are shared with the store's
  // list (see `lib/list-view`), so they are read from the shared view rather
  // than held here. The full installed list is already in memory, so everything
  // below filters on the main thread.
  const search = useListQuery();
  const { unit, scope } = useDestinationView("installed");
  const domain = scope ?? null;
  // Open skill in the shared detail drawer, tracked by identity rather than by
  // index: the provenance and store-entry queries land asynchronously and
  // reshape the list under the reader's pointer, so an index captured at click
  // time could point at a different skill a moment later. The drawer resolves
  // the key against its own list, and a key it cannot find keeps it closed.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const query = useDebouncedValue(search).trim();
  const isSearching = query.length > 0;

  // Anything that re-answers the list resets the detail panel: its skill may
  // not be in the new answer at all.
  //
  // The controls are shared with the other list now, so this watches the answer
  // instead of each control. Switching the unit still lands here as one change,
  // because the list view drops the scope with the unit (`lib/list-view`).
  const shownAnswer = useRef(`${query}\u0000${unit}\u0000${domain ?? "all"}`);
  useEffect(() => {
    const answer = `${query}\u0000${unit}\u0000${domain ?? "all"}`;
    if (shownAnswer.current === answer) return;
    shownAnswer.current = answer;
    setSelectedKey(null);
  }, [query, unit, domain]);

  // Deep link from the menu bar popover: `/my-skills?skill=<name>` pre-fills
  // the search box, which ranks the targeted skill near the top (its name is
  // the whole query, and the name field is boosted) along with any sibling
  // whose terms it shares. The param is consumed (removed) once applied so a
  // refresh stays on the page.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const target = searchParams.get("skill");
    if (!target) return;
    setQuery(target);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // The store's single search entry point, over the installed list: a skill is
  // found by name, every query term must match, a mistyped word does not.
  // Installed lists are short, so the index is cheap to build here and rebuild
  // when the list changes — unlike the registry, which builds the same index in
  // the worker. The matched terms the index reports ride along to the rows,
  // exactly as the store's hits do.
  const searchInstalled = useMemo(() => buildSearchIndex(list), [list]);
  const hits = useMemo(
    () => (query ? searchInstalled(query) : null),
    [query, searchInstalled],
  );

  // One view per listed skill: the on-disk record merged with the store entry
  // its recorded source resolved to. Both the rows and the drawer read these
  // objects, so the two can never disagree about what a skill looks like, and
  // the store's facts are present exactly when the registry holds an entry.
  const rows = useMemo<Row[]>(() => {
    const entries = hits
      ? hits.map((hit) => ({ skill: hit.doc, matched: hit.matched }))
      : list.map((skill) => ({ skill, matched: undefined }));
    return entries.map(({ skill, matched }) => ({
      skill: installedSkillView(skill, linked, storeEntries[skill.name]),
      enabled: skill.enabled,
      suggestion: suggestions?.[skill.name],
      matched,
    }));
  }, [hits, list, linked, storeEntries, suggestions]);

  // One card per source repository: the skills no recorded source vouches for
  // pool into the one card that stands for them, so every installed skill still
  // lives somewhere. Inside each card the installs read newest-first (the same
  // order the time filing below puts the cards in, and the order the card's
  // preview caps, so the newest install is the first row rather than hidden
  // past the cap), and the cards themselves are name-ordered here purely as
  // the stable base the time filing ties break against.
  const cards = useMemo<RepoGroup[]>(() => {
    const byRepo = new Map<string, Row[]>();
    for (const row of rows) {
      const bucket = byRepo.get(row.skill.repo);
      if (bucket) bucket.push(row);
      else byRepo.set(row.skill.repo, [row]);
    }
    return Array.from(byRepo, ([repo, items]) => ({
      repo,
      items: items.toSorted(
        compareByInstalledTime(
          (row) => row.skill.installedAt,
          (a, b) => a.skill.name.localeCompare(b.skill.name),
        ),
      ),
    })).toSorted((a, b) => a.repo.localeCompare(b.repo));
  }, [rows]);

  // The skill unit's filing: the same rows, grouped by the calendar day each
  // install landed on (one group per day, newest first — see
  // `lib/time-groups`) rather than ranked by the store's install count, and
  // scoped to the chosen domain by membership, since a skill's own
  // classification is what the chip row counts here. Installs the platform
  // recorded no birth time for pool in the trailing 时间未知 group.
  const timeGroups = useMemo<TimeGroup<Row>[]>(() => {
    if (unit !== "skill" || isSearching) return [];
    const scoped =
      domain === null
        ? rows
        : rows.filter((row) => domainsOf(row.skill).includes(domain));
    return groupByInstallTime(scoped, (row) => row.skill.installedAt);
  }, [unit, rows, isSearching, domain]);

  // The unit's flat order: groups in day order, skills newest-first within
  // each one — the order the rows' ordinals enumerate and the drawer walks. A
  // search is left exactly as the index answered it: relevance is a ranking
  // too, and the better one while a query is live — the same order the store
  // keeps there.
  const activeRows = useMemo(
    () =>
      unit !== "skill"
        ? []
        : isSearching
          ? rows
          : timeGroups.flatMap((group) => group.items),
    [unit, isSearching, rows, timeGroups],
  );

  // Each row's ordinal in the flat order, so numbering runs continuously
  // across the groups rather than restarting per bucket.
  const rowOrdinals = useMemo(() => {
    const ordinals = new Map<string, number>();
    activeRows.forEach((row, index) =>
      ordinals.set(skillKey(row.skill), index),
    );
    return ordinals;
  }, [activeRows]);

  // The category chips of the unit on screen: how many *repositories* a domain
  // holds, or how many *skills*. A repository rides every domain its rows belong
  // to and a skill every domain it belongs to; either way one nothing classified
  // holds the 未分类 chip of its own, apart from the dataset's 其他. The two
  // units file the same installs differently, which is exactly why the count
  // follows the unit — a chip that promised six skills must not scope the list
  // to two cards.
  const chips = useMemo(() => {
    if (unit === "skill") {
      return domainFacets(rows, (row) => domainsOf(row.skill));
    }
    return domainFacets(cards, (card) => {
      const keys = new Set<string>();
      for (const row of card.items) {
        for (const key of domainsOf(row.skill)) keys.add(key);
      }
      return Array.from(keys);
    });
  }, [unit, rows, cards]);

  // The repository unit's filing: the cards, grouped by when their *newest*
  // install landed — a card reading 今天 has something new in it — ordered
  // newest-first within every day (ties by name, set in `cards`), and
  // scoped to the chosen domain by membership, since a card rides every domain
  // its rows belong to. Cards whose installs all lack a birth time pool in the
  // trailing 时间未知 bucket. A search leaves the filing to the index.
  const repoGroups = useMemo<TimeGroup<RepoGroup>[]>(() => {
    if (unit !== "repo" || isSearching) return [];
    const scoped =
      domain === null
        ? cards
        : cards.filter((card) =>
            card.items.some((row) => domainsOf(row.skill).includes(domain)),
          );
    return groupByInstallTime(scoped, (card) =>
      newestInstallTime(card.items, (row) => row.skill.installedAt),
    );
  }, [unit, isSearching, cards, domain]);

  // What the answer on screen is made of: one time bucket in either unit —
  // a bucket, not a card or skill, is what the reveal counts, because a bucket
  // is what both units list.
  const itemCount = unit === "skill" ? timeGroups.length : repoGroups.length;
  // What the 全部 chip counts, in the unit on screen: every repository, or every
  // skill.
  const totalCount = unit === "skill" ? rows.length : cards.length;

  // Progressive rendering: only the first `renderedCount` items are mounted;
  // an IntersectionObserver on the sentinel below the list extends the count
  // while the reader scrolls. A new answer (a search, a scope, a unit, a
  // reshaped list) re-seeds the run to the same depth.
  const {
    count: renderedCount,
    sentinelRef,
    done,
  } = useProgressiveReveal({
    total: itemCount,
    initial: INITIAL_CARDS,
    step: CARD_CHUNK,
    resetKey: `${unit}\u0000${query}\u0000${domain ?? "all"}\u0000${list.length}`,
  });
  const shownSkillGroups = timeGroups.slice(0, renderedCount);
  const shownRepoGroups = repoGroups.slice(0, renderedCount);

  // The drawer walks every skill of the answer on screen, in the order the unit
  // lists it: a card's preview cap and the groups' progressive reveal are
  // rendering choices, not the list's extent.
  const detailSkills = useMemo(
    () =>
      unit === "skill"
        ? activeRows.map((row) => row.skill)
        : repoGroups.flatMap((group) =>
            group.items.flatMap((card) => card.items.map((row) => row.skill)),
          ),
    [unit, activeRows, repoGroups],
  );

  // The migration affordance trails a row in either unit, and it is only
  // meaningful while the source is unknown: an install the ledger placed has a
  // repository to point at, so a route to the store would be a second answer to
  // a question already answered.
  const rowExtra = (row: Row) =>
    !row.skill.repo && row.suggestion?.length ? (
      <LinkSuggestionBadge name={row.skill.name} candidates={row.suggestion} />
    ) : undefined;

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The list's own first row: the classifications that hold an install (one
          press to scope the list; 全部 clears it), and the agent strip — this
          page's own status — out at the far edge.
          The chips are a browse control — a search re-orders the list by
          relevance and ignores them — so they stand down while a search is live;
          the strip stays, because a status the reader is owed does not depend on
          what they happen to be looking at. The chips count what the unit lists,
          so the figures and the list they scope can never disagree. */}
      <div className="mb-3 flex min-w-0 items-center gap-3">
        {!isSearching && rows.length > 0 && (
          <ListFacets
            facets={chips}
            total={totalCount}
            selected={domain}
            onSelect={(key) => setScope("installed", key)}
          />
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <AgentAvatarMenu />
        </div>
      </div>

      {/* The list — repository cards or skill rows; the modal detail drawer
          overlays either without reflowing it or moving its scroll position. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5">
          {isError ? (
            <Placeholder
              icon={Users}
              message={t("state.loadFailed", {
                message: errorMessage(error),
              })}
            />
          ) : isLoading ? (
            // The same card- or row-shaped skeleton the store lists paint:
            // switching to this page lands on its final layout instead of an
            // empty spin.
            <SkeletonList
              rows={unit === "skill" ? SKELETON_ROWS : SKELETON_CARDS}
              listClassName={
                unit === "skill" ? SKILL_ROW_LIST_CLASS : REPO_LIST_CLASS
              }
              itemClassName={
                unit === "skill"
                  ? SKILL_ROW_SKELETON_CLASS
                  : REPO_CARD_SKELETON_CLASS
              }
            />
          ) : list.length === 0 ? (
            <Placeholder icon={Boxes} message={t("state.noInstalled")} />
          ) : isSearching ? (
            // The unified search answer: three sections — what this machine
            // has (the rows above, injected with the enable switch, the dimmed
            // disabled install and the migration badge that only this surface
            // knows), what the store carries, what skills.sh answers live. One
            // shared implementation with the store's page (see
            // `SearchResults`); keyed by the answer's definition, so no stale
            // fold or selection survives into a differently-shaped answer.
            <SearchResults
              key={`${unit}:${query}`}
              unit={unit}
              query={query}
              installed={rows.map((row) => ({
                skill: row.skill,
                matched: row.matched,
                muted: !row.enabled,
                extra: rowExtra(row),
                action: <SkillEnableSwitch skill={row.skill} />,
              }))}
              installedSurface
            />
          ) : itemCount === 0 ? (
            <Placeholder
              message={
                unit === "skill"
                  ? t("state.noMatchSkill")
                  : t("state.noMatchRepo")
              }
            />
          ) : unit === "skill" ? (
            // The skill unit: one section per calendar day — 今天 first,
            // 时间未知 last — and within a section one row per install,
            // newest first. The same row a repository's own page lists, so a
            // skill reads the same wherever it is found. A day group only
            // names the order — nothing to act on — so its boundary is one
            // small muted line at the group's start, not a header over the
            // rows; the drawer still walks every row in the same flat
            // newest-first order.
            <div className="flex flex-col gap-6">
              {shownSkillGroups.map((group) => (
                <GroupSection
                  key={group.key}
                  label={groupHeading(group, t)}
                >
                  <ul className={SKILL_ROW_LIST_CLASS}>
                    {group.items.map((row) => {
                      const key = skillKey(row.skill);
                      return (
                        <SkillRow
                          key={key}
                          skill={row.skill}
                          matched={row.matched}
                          index={rowOrdinals.get(key) ?? 0}
                          // An installed list is not a leaderboard: the figures
                          // it does carry come from the store, and the installs
                          // it cannot place at all would leave the podium on
                          // alphabetical order. The numbers merely count.
                          ranked={false}
                          selected={key === selectedKey}
                          muted={!row.enabled}
                          extra={rowExtra(row)}
                          action={<SkillEnableSwitch skill={row.skill} />}
                          onSelect={() => setSelectedKey(key)}
                        />
                      );
                    })}
                  </ul>
                </GroupSection>
              ))}
            </div>
          ) : (
            // The repository unit: one section per relative-time bucket — a
            // card sits in the bucket its newest install belongs to — and
            // within a section one card per repository, newest-first. The card
            // itself lists its installs newest-first. Like in the skill unit,
            // a bucket only names the order: a quiet caption above the card
            // grid marks the boundary, and the drawer still walks every card's
            // rows in the same flat order.
            <div className="flex flex-col gap-6">
              {shownRepoGroups.map((group) => (
                <GroupSection
                  key={group.key}
                  label={groupHeading(group, t)}
                >
                  <ul className={REPO_LIST_CLASS}>
                    {group.items.map((card) => (
                      <RepoCard
                        key={card.repo || LOCAL_POOL_KEY}
                        repo={card.repo}
                        stars={starsOf(card)}
                        skills={card.items.map((row) => ({
                          skill: row.skill,
                          matched: row.matched,
                          muted: !row.enabled,
                          extra: rowExtra(row),
                        }))}
                        maxSkills={maxSkills}
                        hasQuery={isSearching}
                        selected={selectedKey}
                        onOpenSkill={setSelectedKey}
                        // A repository card's bar opens the repository as this
                        // list reads it — the installs on disk, with the rest
                        // of the catalogue behind one control; the pool's bar
                        // opens the installed list's own pool page, having no
                        // repository to open.
                        href={
                          card.repo
                            ? `${REPO_PAGE_PATH}${card.repo}`
                            : LOCAL_POOL_PATH
                        }
                        // Card rows carry no per-skill switch: enablement is
                        // one group action on the bar (below), and an
                        // individual switch waits on the page the bar opens.
                        // The disabled rows stay dimmed so the group switch's
                        // state has its evidence.
                        rowActions={false}
                        footerAction={
                          <RepoEnableSwitch
                            names={card.items.map((row) => row.skill.name)}
                            label={card.repo || t("common.localInstall")}
                          />
                        }
                      />
                    ))}
                  </ul>
                </GroupSection>
              ))}
            </div>
          )}
          {/* The sentinel ends the rendered run: while it is on screen the
              observer above extends the run, so scrolling down keeps revealing
              cards or rows until the answer is fully mounted. */}
          {!done && <div ref={sentinelRef} aria-hidden="true" />}
        </div>
      </div>

      {/* Same right-side detail drawer the store pages use, told which list
          owns it: the installed surface replaces the store's install CTA with
          the enable switch and shows no registry-only figures. ←/→ walks the
          whole list. Uninstalling from it closes it: this list shrinks with
          the skill. (Selection by identity is what makes that swap impossible
          in the first place — see `SkillDetailDrawer`.) */}
      <SkillDetailDrawer
        skills={detailSkills}
        selected={selectedKey}
        onSelect={setSelectedKey}
        onRemoved={() => setSelectedKey(null)}
        surface="installed"
      />
    </div>
  );
}
