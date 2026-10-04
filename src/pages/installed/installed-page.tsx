import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Boxes, PowerOff, Users } from "lucide-react";

import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { useDestinationView, useListQuery } from "../../hooks/use-list-view";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { setQuery } from "../../lib/list-view";
import { buildSearchIndex } from "../../lib/search-index";
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
import { Placeholder } from "../../components/placeholder";
import { errorMessage } from "../../lib/utils";
import { popularity } from "../../lib/popularity";
import { estimateTokens } from "../../lib/token-estimate";
import type { Skill } from "../../types/skill";
import type { SkillMatched } from "../../components/highlighted-text";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { RepoEnableSwitch } from "../../components/repo-enable-switch";
import { SkillRow } from "../explore/skill-row";
import {
  compareByInstalledTime,
  newestInstallTime,
} from "../../lib/install-time";
import { SkeletonList } from "../../components/skeleton-list";
import { ListToolbar } from "../../components/list-toolbar";
import { LinkSuggestionBadge } from "./link-suggestion-badge";
import type { LinkCandidate } from "../../lib/link-suggestions";
import { RepoCard } from "../explore/repo-card";
import { SearchResults } from "../explore/search-results";
import { CollapsibleSection } from "../../components/collapsible-section";
import { splitByEnabled } from "../../lib/enabled-split";

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
 * The comparator behind the 热度 sort: the registry's blended
 * installs-and-stars figure, most-popular first, and an equal figure falls
 * back to the install's own clock, newest first — the order the list was born
 * answering in, so the fallback never surprises. `popularityOf` reads a plain
 * number (a row the registry does not back carries no figure at all and reads
 * 0: such a row simply sinks, never borrowing stars it cannot show).
 */
function compareByPopularity<T>(
  popularityOf: (item: T) => number,
  timeOf: (item: T) => number | null | undefined,
  tieBreak: (a: T, b: T) => number = () => 0,
): (a: T, b: T) => number {
  return (a, b) => {
    const pa = popularityOf(a);
    const pb = popularityOf(b);
    if (pa !== pb) return pb - pa;
    return compareByInstalledTime(timeOf, tieBreak)(a, b);
  };
}

/** A row's name, the tie-break both sorts share inside the flat lists. */
const byName = (a: Row, b: Row) => a.skill.name.localeCompare(b.skill.name);

/**
 * Whether a row's skill takes part in the collection. Named once at module level
 * so the two splits below can depend on it: a predicate rebuilt on every render
 * would be a new identity each time, and a `useMemo` keyed on it would never hit.
 */
const isRowEnabled = (row: Row) => row.enabled;

/**
 * The comparator behind the 按仓库 sort: the most-starred repository leads,
 * and the figure-less cards — the source-less pool, or a source the registry
 * no longer lists — sink below every figure. Cards the stars cannot separate
 * (equal figures, all figures absent) fall back to the newest-install order
 * the repository reading was born with, then to the name.
 */
function compareByStars<T>(
  figureOf: (item: T) => number | undefined,
  fallback: (a: T, b: T) => number,
): (a: T, b: T) => number {
  return (a, b) => {
    const sa = figureOf(a);
    const sb = figureOf(b);
    if (sa == null && sb == null) return fallback(a, b);
    if (sa == null) return 1;
    if (sb == null) return -1;
    if (sa !== sb) return sb - sa;
    return fallback(a, b);
  };
}

/**
 * The installed list — the management counterpart of the store's 全部 page.
 * One control on the list's own first row answers both what the screen is
 * made of and what order it reads in — four sorts, where the last carries
 * the shape the old unit switch used to pick:
 *
 * - **按热度** (the default): one row per install, the registry's blended
 *   installs-and-stars figure leading — the same figure every row displays,
 *   so the order and the numbers beside it can never disagree.
 * - **按仓库**: one card per source repository, led by the most-starred
 *   repository (cards the stars cannot separate keep the newest-install
 *   order), listing that repository's installed skills newest-first (up to
 *   the preview size set in Advanced Settings, 3 by default). Installs no
 *   recorded source vouches for have no repository to belong to, so they pool
 *   into one card of their own rather than inventing one — the same shape,
 *   with its bar stating 本地安装 in place of a repository it would have to
 *   make up, and opening the page that lists the pool whole.
 * - **按安装时间**: one row per install — the installs' own clock, newest
 *   first, so "what did I add lately" reads top to bottom. Each row states
 *   its own stamp where the default sort prints the blend, so the figure a
 *   row shows is always the one the list is ordered by. Nothing caps the
 *   skill rows: that shape is the whole list.
 * - **按 Token 占用**: one row per install — the description's estimated
 *   context cost heaviest first (see `lib/token-estimate`), so "what does
 *   keeping this skill cost" reads top to bottom. Each row states its own
 *   estimate where the other sorts print their figures; ties fall back to
 *   the install's clock, and a description-less install honestly reads last
 *   at zero.
 *
 * A search re-answers any of the four in relevance order. What the page adds
 * to the store's surfaces is what only an installed skill has: enablement —
 * at two granularities, one per repository card: the bar's group switch (a
 * press enables or disables every skill of that card; a mixed card reads as
 * half on) and each row's own switch, revealed on hover in the same floating
 * slot the store's install buttons live in — the dimming of a disabled row,
 * and the migration badge beside an install whose source the ledger cannot
 * vouch for. A card also names what its repository still has that this
 * machine does not: a badge on the card's bar states the count of uninstalled
 * siblings, and a press on the bar unfolds them (each with the store's
 * install button) as their own group under the divider.
 * The skill shape carries its per-row switch, and every sort feeds the same
 * detail drawer, so what a skill looks like never depends on how the list is
 * ordered.
 *
 * One thing about the order is not the reader's to pick: in the skill shape a
 * disabled install is parked below every live one, in a titled section of its
 * own, under all three orders alike. It is parked rather than sorted because it
 * is not competing — a skill switched off takes no part in the collection, so
 * letting the popularity blend put it above a live skill would rank something
 * the reader has already set aside. The three orders still say everything about
 * the live half, and each half keeps its own order inside the section, so
 * "which of these did I install last" is still answerable among the parked ones.
 * The repository shape has no such split: a card is a repository, its rows are
 * what the bar's group switch acts on, and a half-on card is a fact the card
 * exists to state. (A search is out of it too — relevance already re-answers the
 * whole list, and the search view groups by *source*, not by state.)
 */

export function InstalledPage() {
  const { t } = useTranslation();
  const { data: skills, isLoading, isError, error } = useInstalledSkills();

  // Install sources recorded by this app (the provenance ledger), reconciled
  // against the on-disk list on every fetch. Absent entries mean "installed
  // by another tool" — those keep the local-install presentation, and if the
  // registry has plausible namesakes the row offers a confirmable link.
  const { data: provenanceState } = useSkillProvenance();
  const linked = provenanceState?.linked;
  const suggestions = provenanceState?.suggestions;
  const cut = provenanceState?.cut;

  // The registry entries behind those recorded sources, keyed by skill name:
  // the store facts an on-disk record never carries (classification, the
  // install count), so the installed list can show the store's card for
  // the skills the ledger placed. Empty for tool installs — nothing to resolve.
  const storeEntries = useInstalledStoreEntries(linked);

  const list = useMemo(() => skills ?? [], [skills]);

  // What the reader is looking for, how the list reads, and which
  // classification they scoped it to: all three are shared with the store's
  // list (see `lib/list-view`), so they are read from the shared view rather
  // than held here. The shape and the order are two answers again: the list is
  // one of skill rows or of repository cards, and each reads in its own orders.
  // The full installed list is already in memory, so everything below filters on
  // the main thread.
  const search = useListQuery("installed");
  const { scope, sort = "popularity", unit = "skill" } =
    useDestinationView("installed");
  const domain = scope ?? null;
  // The field is answered as it is typed, the list on the settled word: the
  // question the reader reads while typing is their own, not a half-word they
  // have already committed to. A live question re-answers the list by relevance,
  // which is why the scope and the order lock beside the field (see
  // `ListToolbar`).
  const query = useDebouncedValue(search).trim();
  const isSearching = query.length > 0;
  // Open skill in the shared detail drawer, tracked by identity rather than by
  // index: the provenance and store-entry queries land asynchronously and
  // reshape the list under the reader's pointer, so an index captured at click
  // time could point at a different skill a moment later. The drawer resolves
  // the key against its own list, and a key it cannot find keeps it closed.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Anything that re-answers the list resets the detail panel: its skill may
  // not be in the new answer at all.
  //
  // The controls are shared with the other list now, so this watches the answer
  // instead of each control. The sort carries the unit (it is derived above),
  // so one field here covers both switches' old answers.
  const shownAnswer = useRef(`${query}\u0000${domain ?? "all"}\u0000${sort}`);
  useEffect(() => {
    const answer = `${query}\u0000${domain ?? "all"}\u0000${sort}`;
    if (shownAnswer.current === answer) return;
    shownAnswer.current = answer;
    setSelectedKey(null);
  }, [query, domain, sort]);

  // Deep link from the menu bar popover: `/installed?skill=<name>` asks the
  // list's own question, which ranks the targeted skill near the top of the
  // answer (its name is the whole query) along with any sibling whose terms it
  // shares. The param is consumed (removed) once applied, so a refresh stays on
  // the page with the question still in the field.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const target = searchParams.get("skill");
    if (!target) return;
    setQuery("installed", target);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  // The store's single search entry point, over the installed list: a skill is
  // found by name, every query term must match, a mistyped word does not.
  // Installed lists are short, so the index is cheap to build here and rebuilds
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
  // While a question is live the list *is* its hits — same view, same surface,
  // relevance order and highlights instead of the whole install list.
  const rows = useMemo<Row[]>(() => {
    if (!hits) {
      return list.map((skill) => ({
        skill: installedSkillView(
          skill,
          linked,
          storeEntries[skill.name],
          cut?.[skill.name],
        ),
        enabled: skill.enabled,
        suggestion: suggestions?.[skill.name],
      }));
    }
    return hits.map((hit) => ({
      skill: installedSkillView(
        hit.doc,
        linked,
        storeEntries[hit.doc.name],
        cut?.[hit.doc.name],
      ),
      enabled: hit.doc.enabled,
      suggestion: suggestions?.[hit.doc.name],
      matched: hit.matched,
    }));
  }, [cut, hits, list, linked, storeEntries, suggestions]);

  // Linking or unlinking a source inside the detail drawer changes the
  // skill's identity (the unlinked `/name` key becomes `repo/name` and
  // back). The drawer must never render the closed state in between, so the
  // stale key is remapped during render: the name is the key's last segment
  // (the repo half of a linked key contains slashes; the name never does),
  // and the row carrying that name supplies the key's new shape. The state
  // is synced right after.
  const selectedName =
    selectedKey == null ? null : selectedKey.slice(selectedKey.lastIndexOf("/") + 1);
  const selectedRow = selectedName
    ? rows.find((r) => r.skill.name === selectedName)
    : undefined;
  const selected =
    selectedRow && skillKey(selectedRow.skill) !== selectedKey
      ? skillKey(selectedRow.skill)
      : selectedKey;
  useEffect(() => {
    if (selected !== selectedKey) setSelectedKey(selected);
  }, [selected, selectedKey]);

  // One card per source repository: the skills no recorded source vouches for
  // pool into the one card that stands for them, so every installed skill still
  // lives somewhere. Inside each card the installs read newest-first — the
  // card's own clock, whatever sort the cards themselves answer to — so the
  // newest install is the first row rather than hidden past the preview cap.
  // The cards themselves are name-ordered here purely as the stable base the
  // star and time orderings tie break against.
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
          byName,
        ),
      ),
    })).toSorted((a, b) => a.repo.localeCompare(b.repo));
  }, [rows]);

  // The skill unit's flat order: the installs in the chosen sort's order —
  // the registry's popularity blend (the default), newest-first by the
  // recorded install time (see `lib/install-time`), or heaviest-first by the
  // description's estimated token cost (see `lib/token-estimate` — the same
  // estimate the detail drawer states, an empty description honestly reading
  // 0 rather than sinking) — scoped to the chosen domain by membership, since
  // a skill's own classification is what the picker counts here. Installs
  // the platform recorded no birth time for settle last in the time order. A
  // search is left exactly as the index answered it: relevance is a ranking
  // too, and the better one while a question is live — the same order the
  // store keeps there.
  const activeRows = useMemo(() => {
    if (unit !== "skill") return [];
    if (isSearching) return rows;
    const scoped =
      domain === null
        ? rows
        : rows.filter((row) => domainsOf(row.skill).includes(domain));
    return scoped.toSorted(
      sort === "installed"
        ? compareByInstalledTime((row) => row.skill.installedAt)
        : // The token sort borrows the popularity comparator's shape — a
          // figure descending, ties to the install's clock — with the token
          // estimate in the figure slot. A description-less skill reads 0,
          // which is its true cost, not a fabrication.
          compareByPopularity(
            sort === "tokens"
              ? (row) => estimateTokens(row.skill.description ?? "")
              : (row) => popularity(row.skill),
            (row) => row.skill.installedAt,
            byName,
          ),
    );
  }, [unit, rows, isSearching, domain, sort]);

  // Each row's ordinal in the flat order, so numbering runs continuously
  // across the groups rather than restarting per bucket.
  const rowOrdinals = useMemo(() => {
    const ordinals = new Map<string, number>();
    activeRows.forEach((row, index) =>
      ordinals.set(skillKey(row.skill), index),
    );
    return ordinals;
  }, [activeRows]);

  // The category facets of the unit on screen: how many *repositories* a domain
  // holds, or how many *skills*. A repository rides every domain its rows belong
  // to and a skill every domain it belongs to; either way one nothing classified
  // holds the 未分类 item of its own, apart from the dataset's 其他. The two
  // units file the same installs differently, which is exactly why the count
  // follows the unit — an item that promised six skills must not scope the list
  // to two cards.
  const facets = useMemo(() => {
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

  // The repository shape's flat order — the sort's own answer over cards:
  // by their repository's stars (the 按仓库 option; the figure-less pool and
  // unlisted sources sink, and cards the stars cannot separate keep the
  // newest-install order). Scoped to the chosen domain by membership, since a
  // card rides every domain its rows belong to. A search answers in the shared
  // search view instead, in the shape on screen — the cards here are the browse
  // answer's, and relevance ranks skills, not repositories.
  const activeCards = useMemo<RepoGroup[]>(() => {
    if (unit !== "repo" || isSearching) return [];
    const scoped =
      domain === null
        ? cards
        : cards.filter((card) =>
            card.items.some((row) => domainsOf(row.skill).includes(domain)),
          );
    // Cards are led by the repository's own stars, and that is the whole of
    // their order: a card is a repository, so the figure it answers in is the
    // repository's. The three orders the row shape offers say nothing about it —
    // which is why the order control is gone in this shape (see `ListToolbar`),
    // and why an installed-clock or token pick could never have reordered these
    // cards whatever the control said.
    const byNewestInstall = compareByInstalledTime<RepoGroup>(
      (card) => newestInstallTime(card.items, (row) => row.skill.installedAt),
      (a, b) => a.repo.localeCompare(b.repo),
    );
    return scoped.toSorted(
      compareByStars((card) => starsOf(card), byNewestInstall),
    );
  }, [unit, isSearching, cards, domain]);

  // The registry's own grouping — every skill it lists, per repository — so
  // each card can also name the repository's skills this machine does not
  // have. The answer is the same cached one the store's browse list reads
  // (an empty query means "browse the registry in order"), so this page adds
  // no download of its own; it only runs while the repository unit browses —
  // a search asks that index its own question instead, in the shared search
  // view. A registry skill not in the installed list is uninstalled, matched by
  // name — the same identity the install button and the enable switch
  // resolve by. The source-less pool has no repository to ask about.
  const { data: registryGroups } = useRegistryGroups(
    "",
    unit === "repo" && !isSearching && list.length > 0,
  );

  const uninstalledByRepo = useMemo(() => {
    const map = new Map<string, Skill[]>();
    if (!registryGroups) return map;
    const installed = new Set(list.map((skill) => skill.name));
    for (const group of registryGroups.groups) {
      const rest = group.skills
        .map((hit) => hit.skill)
        .filter((skill) => !installed.has(skill.name));
      if (rest.length > 0) map.set(group.title, rest);
    }
    return map;
  }, [registryGroups, list]);

  // What the answer on screen is made of: one row or one card per entry — the
  // entry, not a bucket, is what the reveal counts, because an entry is what
  // both units list.
  const itemCount = unit === "skill" ? activeRows.length : activeCards.length;
  // What the 全部 item counts, in the unit on screen: every repository, or every
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
    // The sort carries the unit, so one field names the whole shape change.
    resetKey: `${sort}\u0000${query}\u0000${domain ?? "all"}\u0000${list.length}`,
  });
  const shownRows = activeRows.slice(0, renderedCount);
  const shownCards = activeCards.slice(0, renderedCount);

  // The skill unit's answer, divided by whether a skill takes part at all: the
  // live installs first, the parked ones in a section of their own below. The
  // split runs over the sorted rows rather than inside the sort, so it holds for
  // every order the list offers (and for one added later) without any comparator
  // knowing about it — see `lib/enabled-split`. Each half keeps the order the
  // sort gave it, so switching to 按安装时间 re-orders within the parked section
  // exactly as it re-orders the live one.
  //
  // Two splits, one per question. The rendered one runs over the *revealed* rows
  // so the progressive reveal still bounds what is mounted: the parked section
  // grows as the reader scrolls, and its badge counts what it actually holds.
  // The drawer's runs over the whole answer, because the drawer walks every skill
  // the list holds, not the prefix that happens to be on screen.
  const splitRows = useMemo(() => splitByEnabled(shownRows, isRowEnabled), [
    shownRows,
  ]);
  const splitActive = useMemo(
    () => splitByEnabled(activeRows, isRowEnabled),
    [activeRows],
  );

  // The drawer walks every skill of the answer on screen, in the order the unit
  // lists it: a card's preview cap and the progressive reveal are rendering
  // choices, not the list's extent.
  //
  // In the skill unit it walks the *split* order, so the row ←/→ lands on is the
  // row below or above the one on screen. Walking the raw sort order instead
  // would make the walk disagree with the list the moment anything is parked —
  // pressing → on the last live row would jump to a skill drawn far above it.
  const detailSkills = useMemo(
    () =>
      unit === "skill"
        ? [...splitActive.enabled, ...splitActive.disabled].map(
            (row) => row.skill,
          )
        : activeCards.flatMap((card) => card.items.map((row) => row.skill)),
    [unit, splitActive, activeCards],
  );

  // The link affordance is only meaningful while the source is unknown: an
  // install the ledger placed has a repository to point at. In the skill unit
  // the label and icon are merged into one trigger ("label"); a repo-card row
  // takes the icon alone, since the card's bar already names the source.
  const rowExtra = (row: Row, variant: "label" | "icon") =>
    !row.skill.repo ? (
      <LinkSuggestionBadge
        name={row.skill.name}
        localDescription={row.skill.description}
        candidates={row.suggestion ?? []}
        cutRepos={row.skill.cutRepos}
        variant={variant}
      />
    ) : undefined;

  /**
   * One row of the skill unit. Shared by the live list and the parked section so
   * a skill reads the same in both — the only thing that says which half it is in
   * is the half it is drawn under, never the row itself. The ordinal still comes
   * from the flat order, so numbering runs 1…N straight through both halves
   * rather than restarting at the section.
   */
  const renderSkillRow = (row: Row) => {
    const key = skillKey(row.skill);
    return (
      <SkillRow
        key={key}
        skill={row.skill}
        index={rowOrdinals.get(key) ?? 0}
        // The row numbers its position in the order the reader picked, and the
        // first three of that order wear the podium — the same mark in every unit
        // and in both shapes, so an installed skill reads the same wherever it is
        // listed. The claim is about the *chosen* order, not about weight: under
        // 按安装时间 the podium is the three newest installs, under Token 占用 the
        // three heaviest, and this list is content to call either a ranking,
        // because that is the order the reader asked to read by.
        fact={
          sort === "installed"
            ? "installedAt"
            : sort === "tokens"
              ? "tokens"
              : "popularity"
        }
        selected={key === selected}
        muted={!row.enabled}
        extra={rowExtra(row, "label")}
        action={<SkillEnableSwitch skill={row.skill} />}
        onSelect={() => setSelectedKey(key)}
      />
    );
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The list's own first row, and the only row above the answer: the
          field that names what the reader is looking for, the classifications
          that hold an install (one press to scope the browse; 全部 clears it),
          the shape switch, and the sort switch that says what order the list
          reads in. The scope and the order lock while a question is live — a
          search re-ranks by relevance and ignores both. The row counts what the
          shape on screen lists, so the figures and the list they scope can never
          disagree. The row's arrangement is `ListToolbar`'s to answer; the page hands
          over its counts and whether the question has settled. */}
      <ListToolbar
        destination="installed"
        facets={facets}
        total={totalCount}
        searching={isSearching}
      />

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
            // The search answer: the shared search view's installed surface —
            // what this machine has, in relevance order, with the enable switch,
            // the dimmed disabled install and the migration badge that only this
            // surface knows. The registry's own answer waits below it as a cheap
            // supplement, and skills.sh behind its press. Keyed by the answer's
            // definition, so no stale fold or selection survives into a
            // differently-shaped answer.
            <SearchResults
              key={`${unit}:${query}`}
              unit={unit}
              query={query}
              destination="installed"
              installed={rows.map((row) => ({
                skill: row.skill,
                matched: row.matched,
                muted: !row.enabled,
                extra: rowExtra(row, "label"),
                action: <SkillEnableSwitch skill={row.skill} />,
              }))}
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
            // The skill unit: one row per install, in the sort's own order —
            // the live installs first, then the parked ones in a section of
            // their own. The same row a repository's own page lists, so a skill
            // reads the same wherever it is found — and the figure each row
            // states is the one this list answers in: the install's own clock
            // under the 按安装时间 sort, the popularity blend otherwise.
            //
            // The section is drawn only when something is parked: a list with
            // nothing disabled is exactly the list this page always drew, and an
            // absent section reads quieter than a zero. Its fold is the reader's
            // own ("not working with these right now"), so it is left to survive
            // a change of sort or scope — both of which only re-order or narrow
            // rows that stay parked. It is not keyed by the answer, and a scope
            // that parks nothing unmounts the section outright, so the next time
            // one appears it starts open.
            <>
              {splitRows.enabled.length > 0 && (
                <ul className={SKILL_ROW_LIST_CLASS}>
                  {splitRows.enabled.map(renderSkillRow)}
                </ul>
              )}
              {splitRows.disabled.length > 0 && (
                <CollapsibleSection
                  className="border-t border-border/60 pt-6"
                  icon={PowerOff}
                  title={t("list.disabled")}
                  count={t("state.skillCount", {
                    count: splitRows.disabled.length,
                  })}
                >
                  <ul className={SKILL_ROW_LIST_CLASS}>
                    {splitRows.disabled.map(renderSkillRow)}
                  </ul>
                </CollapsibleSection>
              )}
            </>
          ) : (
            // The repository unit: one card per repository, led by the
            // repository's own stars (the figure the card itself prints, so the
            // order and the numbers above it cannot disagree), ties broken by
            // each card's newest install. The card itself lists its installs
            // newest-first. Each card states its own place in that stack, the
            // same number the skill unit's rows carry — the cards take the whole
            // row each, so a column of them is a column the eye can run down.
            <ul className={REPO_LIST_CLASS}>
              {shownCards.map((card, index) => (
                <RepoCard
                  key={card.repo || LOCAL_POOL_KEY}
                  repo={card.repo}
                  stars={starsOf(card)}
                  index={index}
                  skills={card.items.map((row) => ({
                    skill: row.skill,
                    muted: !row.enabled,
                    extra: rowExtra(row, "icon"),
                    // Each row's own enable switch, in the card's floating
                    // hover slot; the disabled rows stay dimmed so the group
                    // switch's state has its evidence.
                    action: <SkillEnableSwitch skill={row.skill} />,
                  }))}
                  selected={selected}
                  onOpenSkill={setSelectedKey}
                  uninstalled={
                    card.repo ? uninstalledByRepo.get(card.repo) : undefined
                  }
                  footerAction={
                    <RepoEnableSwitch
                      names={card.items.map((row) => row.skill.name)}
                      label={card.repo || t("common.localInstall")}
                    />
                  }
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
        selected={selected}
        onSelect={setSelectedKey}
        onRemoved={() => setSelectedKey(null)}
        surface="installed"
      />
    </div>
  );
}
