import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Boxes, Users } from "lucide-react";

import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useRepoCardLimit } from "../../hooks/use-repo-card-limit";
import {
  installedSkillView,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import { domainLabel, domainMeta } from "../../data/domains";
import { domainFacets, domainsOf } from "../../lib/domain-filter";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { Placeholder } from "../../components/placeholder";
import { errorMessage } from "../../lib/utils";
import { buildSearchIndex } from "../../lib/search-index";
import { SearchInput } from "../../components/search-input";
import type { SkillMatched } from "../../components/skill-card";
import { ListUnitToggle, type ListUnit } from "../../components/list-unit-toggle";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { SkillRow } from "../explore/skill-row";
import { SkillRun, buildSkillRuns, byInstalls } from "../explore/skill-run";
import { SkeletonList } from "../../components/skeleton-list";
import { DomainChip } from "../../components/domain-chip";
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
 * figure to state, which is not the same as a figure of zero.
 */
function starsOf(group: RepoGroup): number | undefined {
  const first = group.items[0]?.skill;
  return first?.storeBacked ? first.stars : undefined;
}

/**
 * The installed list — the management counterpart of the store's 全部 page, in
 * the same two units, switched on the toolbar exactly as the store's are:
 *
 * - **按仓库**: one card per source repository, listing that repository's
 *   installed skills (up to the preview size set in Settings, 5 by default) and
 *   signed off by the bar that names the repository and opens its page.
 *   Installs no recorded source vouches for have no repository to belong to, so
 *   they pool into one card of their own rather than inventing one — the same
 *   shape, with its bar stating 本地安装 in place of a repository it would have
 *   to make up, and opening the page that lists the pool whole.
 * - **按技能**: one row per install, most-installed first (a search re-answers
 *   either unit in relevance order), with the same per-repository run and fold
 *   the store's skill unit uses (`SkillRun`), so a repository that ships several
 *   close-ranked installs does not flood the ranking. Nothing caps the rows
 *   here: this unit is the whole list, so the unit that reads it one skill at a
 *   time reads all of them.
 *
 * What the page adds to the store's surfaces is what only an installed skill
 * has: the enable switch in each row's action slot (drawn always — a reader
 * scanning for a disabled skill must see it without pointing), the dimming of a
 * disabled row, and the migration badge beside an install whose source the
 * ledger cannot vouch for. Both units carry all three, and both feed the same
 * detail drawer, so what a skill looks like never depends on how the list is
 * grouped.
 */
export function MySkillsPage() {
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

  // The search text, the domain scope and the list's unit are local state — the
  // full installed list is already in memory, so everything below filters on
  // the main thread.
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
  // The unit the list is read in: the repository cards it opened with, or one
  // row per install (the store's own switch — see `ListUnitToggle`).
  const [unit, setUnit] = useState<ListUnit>("repo");
  // Which folds the reader has opened, by the run head's key: only the skill
  // unit folds, and a run's head key belongs to the answer that produced it, so
  // every control that re-answers the list clears these.
  const [openRuns, setOpenRuns] = useState<Record<string, boolean>>({});
  // Open skill in the shared detail drawer, tracked by identity rather than by
  // index: the provenance and store-entry queries land asynchronously and
  // reshape the list under the reader's pointer, so an index captured at click
  // time could point at a different skill a moment later. The drawer resolves
  // the key against its own list, and a key it cannot find keeps it closed.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const query = useDebouncedValue(search).trim();
  const isSearching = query.length > 0;

  const handleSearch = (q: string) => {
    setSearch(q);
    setSelectedKey(null);
    setOpenRuns({});
  };
  const handleDomain = (next: string | null) => {
    if (next === domain) return;
    setDomain(next);
    setSelectedKey(null);
    setOpenRuns({});
  };
  // Switching the unit re-answers the list, so the revealed depth is re-seeded
  // with it — and so is the domain scope: the two units weigh a domain
  // differently (repositories vs skills), so a scope from one may leave the
  // other empty for a reason the reader never asked for.
  const handleUnit = (next: ListUnit) => {
    setUnit(next);
    setSelectedKey(null);
    setDomain(null);
    setOpenRuns({});
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
    setSelectedKey(null);
    setOpenRuns({});
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

  // One card per source repository, most-populated first (ties by name); the
  // skills no recorded source vouches for pool into the one card that stands
  // for them, so every installed skill still lives somewhere.
  const cards = useMemo<RepoGroup[]>(() => {
    const byRepo = new Map<string, Row[]>();
    for (const row of rows) {
      const bucket = byRepo.get(row.skill.repo);
      if (bucket) bucket.push(row);
      else byRepo.set(row.skill.repo, [row]);
    }
    return Array.from(byRepo, ([repo, items]) => ({ repo, items })).toSorted(
      (a, b) => b.items.length - a.items.length || a.repo.localeCompare(b.repo),
    );
  }, [rows]);

  // The skill unit's list: the same rows, ranked by install count instead of
  // filed by source — and scoped to the chosen domain by membership, since a
  // skill's own classification is what the chip row counts here.
  //
  // A search is left exactly as the index answered it: relevance is a ranking
  // too, and the better one while a query is live — the same order the store
  // keeps there.
  const activeRows = useMemo(() => {
    if (unit !== "skill") return [];
    if (isSearching) return rows;
    const scoped =
      domain === null
        ? rows
        : rows.filter((row) => domainsOf(row.skill).includes(domain));
    return scoped.toSorted(byInstalls);
  }, [unit, rows, isSearching, domain]);

  // The consecutive skills of one source, gathered into runs so a repository
  // that ships several close-ranked installs folds all but its best away (see
  // `SkillRun`).
  const runs = useMemo(() => buildSkillRuns(activeRows), [activeRows]);

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

  // The list on screen. The domain scope is a browse control: a search
  // re-orders the list by relevance and ignores it (the chip row stands down),
  // the same division of labour the store's filter has.
  const visible = useMemo(
    () =>
      isSearching || domain === null
        ? cards
        : cards.filter((card) =>
            card.items.some((row) => domainsOf(row.skill).includes(domain)),
          ),
    [cards, isSearching, domain],
  );

  // What the answer on screen is made of: one card per repository, or one run
  // per source in the skill unit — a run, not a skill, is what the reveal counts
  // there, because a run is what that unit lists (see `SkillRun`).
  const itemCount = unit === "skill" ? runs.length : visible.length;
  // What the 全部 chip counts, in the unit on screen: every repository, or every
  // skill.
  const totalCount = unit === "skill" ? rows.length : cards.length;
  const countLabel = unit === "skill" ? "个 skill" : "个仓库";

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
  const shown = visible.slice(0, renderedCount);
  const shownRuns = runs.slice(0, renderedCount);

  // The drawer walks every skill of the answer on screen, in the order the unit
  // lists it: a card's preview cap and the skill unit's folds are rendering
  // choices, not the list's extent.
  const detailSkills = useMemo(
    () =>
      unit === "skill"
        ? activeRows.map((row) => row.skill)
        : visible.flatMap((card) => card.items.map((row) => row.skill)),
    [unit, activeRows, visible],
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
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-5">
      {/* Toolbar, styled like the store's: the search field first, the same unit
          switch the store offers, and the installed list's own control (the
          agent strip) out at the far edge. */}
      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={handleSearch} label="搜索 Skill" />

        <ListUnitToggle unit={unit} onChange={handleUnit} className="ml-auto" />

        <div className="flex items-center gap-2">
          <AgentAvatarMenu />
        </div>
      </div>

      {/* The category filter: every classification that holds an install, flat,
          one press to scope the list (全部 clears it). It is a browse control —
          a search re-orders the list by relevance and ignores it — so it stands
          only while browsing. Its chips count what the unit lists, so their
          figures and the list they scope can never disagree. */}
      {!isSearching && rows.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <DomainChip
            selected={domain === null}
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
              selected={domain === key}
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

      {/* The list — repository cards or skill rows; the modal detail drawer
          overlays either without reflowing it or moving its scroll position. */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5">
          {isError ? (
            <Placeholder
              icon={Users}
              message={`加载失败：${errorMessage(error)}`}
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
            <Placeholder icon={Boxes} message="还没有安装任何技能" />
          ) : itemCount === 0 ? (
            <Placeholder
              message={
                query
                  ? `未找到匹配“${query}”的 Skill`
                  : unit === "skill"
                    ? "没有符合条件的 skill"
                    : "没有符合条件的仓库"
              }
            />
          ) : unit === "skill" ? (
            // The skill unit: one row per install, most-installed first (or the
            // search's relevance order) — the same row a repository's own page
            // lists, so a skill reads the same wherever it is found. A
            // repository whose installs land in consecutive ranks folds all but
            // the best behind one row (`SkillRun`); the fold hides rows, never
            // the install itself, which the drawer still walks.
            <ul className={SKILL_ROW_LIST_CLASS}>
              {shownRuns.map((group) => {
                const headKey = skillKey(group.items[0].skill);
                return (
                  <SkillRun
                    key={headKey}
                    group={group}
                    open={!!openRuns[headKey]}
                    renderRow={(row, index) => {
                      const key = skillKey(row.skill);
                      return (
                        <SkillRow
                          key={key}
                          skill={row.skill}
                          matched={row.matched}
                          index={index}
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
                    }}
                    onToggle={() =>
                      setOpenRuns((prev) => ({
                        ...prev,
                        [headKey]: !prev[headKey],
                      }))
                    }
                  />
                );
              })}
            </ul>
          ) : (
            <ul className={REPO_LIST_CLASS}>
              {shown.map((card) => (
                <RepoCard
                  key={card.repo || LOCAL_POOL_KEY}
                  repo={card.repo}
                  stars={starsOf(card)}
                  skills={card.items.map((row) => ({
                    skill: row.skill,
                    matched: row.matched,
                    muted: !row.enabled,
                    extra: rowExtra(row),
                    action: <SkillEnableSwitch skill={row.skill} />,
                  }))}
                  maxSkills={maxSkills}
                  hasQuery={isSearching}
                  selected={selectedKey}
                  onOpenSkill={setSelectedKey}
                  // A repository card's bar opens the repository's page; the
                  // pool's opens the installed list's own pool page.
                  href={card.repo ? undefined : LOCAL_POOL_PATH}
                  // The switch is a fact about the row, not an invitation: it
                  // is drawn always rather than revealed on hover.
                  hoverAction={false}
                />
              ))}
            </ul>
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
