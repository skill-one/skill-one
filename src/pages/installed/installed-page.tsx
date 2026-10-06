import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import type { ParseKeys } from "i18next";
import { Boxes, PowerOff, Users } from "lucide-react";

import { useInstalledSkills, markSkillsChanged } from "../../hooks/use-installed-skills";
import { useQueryClient } from "@tanstack/react-query";
import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useCustomTags } from "../../hooks/use-custom-tags";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { useDestinationView, useListQuery } from "../../hooks/use-list-view";
import { useViewMemory } from "../../hooks/use-view-memory";
import { setQuery, REVEAL } from "../../lib/list-view";
import { buildSearchIndex } from "../../lib/search-index";
import { domainsOf, taxonomyRank } from "../../lib/domain-filter";
import { DOMAINS, domainEmoji, domainLabel } from "../../data/domains";
import { useAppLocale } from "../../i18n/use-language";
import { useMultiSelect } from "../../hooks/use-multi-select";
import {
  SelectionActionBar,
  type SelectionTagOption,
} from "../../components/selection-action-bar";
import { toast } from "../../components/ui/toast";
import {
  removeInstalledSkills,
  setManySkillsEnabled,
} from "../../lib/local-skills";
import { saveCustomTagDef, setManySkillTags } from "../../lib/provenance";
import {
  collectTakenTagKeys,
  validateNewTag,
  type TagValidationError,
} from "../../lib/custom-tags";
import {
  installedSkillView,
  skillDisplayName,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_GRID_LIST_CLASS,
  SKILL_GRID_SKELETON_CLASS,
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Placeholder } from "../../components/placeholder";
import { cn, errorMessage } from "../../lib/utils";
import { popularity } from "../../lib/popularity";
import type { Skill } from "../../types/skill";
import type { SkillMatched } from "../../components/highlighted-text";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { RepoEnableSwitch } from "../../components/repo-enable-switch";
import { SkillRow } from "../explore/skill-row";
import { SkillGridCard } from "../explore/skill-grid-card";
import {
  compareByInstalledTime,
  newestInstallTime,
} from "../../lib/install-time";
import { SkeletonList } from "../../components/skeleton-list";
import { ListToolbar } from "../../components/list-toolbar";
import { LinkSuggestionMark } from "./link-suggestion-mark";
import type { LinkCandidate } from "../../lib/link-suggestions";
import { RepoCard } from "../explore/repo-card";
import { SearchResults, type SearchRow } from "../explore/search-results";
import { CollapsibleSection } from "../../components/collapsible-section";
import { splitByEnabled } from "../../lib/enabled-split";
import { SourceLinkBanner, type LinkableSkill } from "./source-link-banner";
import { SourceLinkBatchDialog } from "./source-link-batch-dialog";
import { recordSkillProvenanceBatch } from "../../lib/provenance";

/** Placeholder cards while the on-disk list is first read. */
const SKELETON_CARDS = 8;

/** Placeholder rows while the on-disk list is first read, in the skill unit. */
const SKELETON_ROWS = 12;

/**
 * The installed list's remembered view (see `useViewMemory`): which sections
 * the reader has folded, and how deep the list has been revealed. Both come
 * back with a page switch — the folds and the place they left the list are
 * the reader's, not the visit's — and the reveal resets with the answer (the
 * effect on `signature`): a differently-shaped answer is not a page they were
 * ever at.
 */
interface InstalledView {
  /**
   * Fold state per section; a section absent from here reads at its default.
   * Keys are namespaced (see `foldKey`), so a section's own title can never
   * reach the parked section's fold.
   */
  folds: Record<string, boolean>;
  /** How many entries the progressive reveal has mounted. */
  reveal: number;
}

/**
 * A live section's key in the remembered folds: namespaced, so a tag named
 * like the parked section ("parked") can never reach its fold.
 */
function foldKey(title: string): string {
  return `section:${title}`;
}

/**
 * The time buckets the install-clock grouping files installs into, newest
 * first. Each bucket holds the installs whose age (in whole days) falls below
 * its bound and above the previous one's — rolling windows, so 昨天 means "a
 * day or two old", not a calendar date. The last bucket takes everything
 * older, and an install whose record carries no timestamp reads last (see
 * `compareByInstalledTime`) and files there too: an unreadable clock is not a
 * fresh one.
 */
const TIME_BUCKETS: { titleKey: ParseKeys; maxAgeDays: number | null }[] = [
  { titleKey: "list.bucketToday", maxAgeDays: 1 },
  { titleKey: "list.bucketYesterday", maxAgeDays: 2 },
  { titleKey: "list.bucketLast7", maxAgeDays: 7 },
  { titleKey: "list.bucketLast30", maxAgeDays: 30 },
  { titleKey: "list.bucketEarlier", maxAgeDays: null },
];

/** One day, in seconds — `installedAt` is a Unix-seconds stamp. */
const DAY_SECONDS = 86_400;

/** React-key identity of the pool card: skills no recorded source vouches for. */
const LOCAL_POOL_KEY = "local";

/**
 * The tag assignments before the ledger answers: no choices yet. Module-level
 * so the rows memo below keeps a stable identity while the query is pending —
 * a literal `{}` inline would be a new object every render and the memo would
 * never hit.
 */
const EMPTY_SKILL_TAGS: Record<string, string> = {};

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
 * made of and how it reads — and in the per-skill shapes, the reading is a
 * *grouping*: the answer arrives in titled sections of ten rows each, in the
 * chosen order:
 *
 * - **按热度分组** (the default): one row per install, the registry's blended
 *   installs-and-stars figure leading — the same figure every row displays,
 *   so the order and the numbers beside it can never disagree.
 * - **按仓库**: one card per source repository, led by the most-starred
 *   repository (cards the stars cannot separate keep the newest-install
 *   order), listing that repository's installed skills newest-first (up to
 *   the preview size set in Advanced Settings, 3 by default). Installs no
 *   recorded source vouches for have no repository to belong to, so they pool
 *   into one card of their own rather than inventing one — the same shape,
 *   with its bar stating 本地安装 in place of a repository it would have to
 *   make up, and opening the page that lists the pool whole. The repository
 *   shape does not group: a card is already a section of its own.
 * - **按安装时间分组**: one row per install — the installs' own clock, newest
 *   first, so "what did I add lately" reads top to bottom. Each row states
 *   its own stamp where the default grouping prints the blend, so the figure
 *   a row shows is always the one the list is ordered by. The sections are
 *   the time itself: 今天 / 昨天 / 最近 7 天 / 最近 30 天 / 更早, an
 *   install with no recorded stamp reading last under 更早.
 * - **按标签分组**: one row per install, filed under its classification —
 *   the user's own tag where one was picked (the single select in the detail
 *   drawer), else the store's domain, else 未分类. The sections are the tags
 *   themselves, biggest first (ties fall back to the taxonomy's own order,
 *   then to the label), and each install files under its leading
 *   classification only, so no skill reads twice. Within a section the rows
 *   keep the popularity order, the same reading the default grouping gives.
 *
 * Each section's header names what it holds — the rank range it covers
 * ("1–10", "11–20", …) under the popularity grouping, the bucket's span of
 * time under the install clock, the tag's own label under the tag grouping —
 * with the count it holds beside it: the tag grouping states the section's
 * whole size from the answer itself (the reveal below only bounds what is
 * mounted), while the install clock counts what it has shown so far;
 * every section starts open, and a press on the header folds it — the folds,
 * like the scroll position, are the reader's rather than the visit's, and
 * come back with the page (see `useViewMemory`). An empty
 * bucket draws no section at all. A search stands the sections down and
 * re-answers in relevance order. What the page adds to the store's surfaces
 * is what only an installed skill has: enablement — at two granularities,
 * one per repository card: the bar's group switch (a press enables or
 * disables every skill of that card; a mixed card reads as half on) and each
 * row's own switch, revealed on hover in the same floating slot the store's
 * install buttons live in — the dimming of a disabled row, and the migration
 * badge beside an install whose source the ledger cannot vouch for. A card
 * also names what its repository still has that this machine does not: a
 * badge on the card's bar states the count of uninstalled siblings, and a
 * press on the bar unfolds them (each with the store's install button) as
 * their own group under the divider.
 * The skill shape carries its per-row switch, and every grouping feeds the
 * same detail drawer, so what a skill looks like never depends on how the
 * list is grouped.
 *
 * One thing about the order is not the reader's to pick: in the per-skill
 * shapes a disabled install is parked below every live one, in a titled
 * section of its own, under both groupings alike. It is parked rather than
 * sorted because it is not competing — a skill switched off takes no part in
 * the collection, so letting the popularity blend put it above a live skill
 * would rank something the reader has already set aside. Both groupings still
 * say everything about the live sections, and the parked half keeps its own
 * order inside its section, so "which of these did I install last" is still
 * answerable among the parked ones. The parked section starts folded — the
 * count it carries is what says there is something set aside.
 */

export function InstalledPage() {
  const { t } = useTranslation();
  // The locale the tag sections name themselves in: a tag header is the
  // classification's own label, resolved the same way the row badges are.
  const locale = useAppLocale();
  const { data: skills, isLoading, isError, error } = useInstalledSkills();

  // Install sources recorded by this app (the provenance ledger), reconciled
  // against the on-disk list on every fetch. Absent entries mean "installed
  // by another tool" — those keep the local-install presentation, and if the
  // registry has plausible namesakes the row offers a confirmable link.
  const { data: provenanceState } = useSkillProvenance();
  const linked = provenanceState?.linked;
  const suggestions = provenanceState?.suggestions;
  const cut = provenanceState?.cut;

  // The user taxonomy plus one tag choice per installed skill, read off the
  // same ledger as the sources above (and refreshed by the same
  // `markSkillsChanged`). A choice overrides the store's classification for
  // that skill — the single select — so a hand-placed local install files
  // where the user filed it instead of pooling under 未分类.
  const { data: customTags } = useCustomTags();
  const assignments = customTags?.skillTags ?? EMPTY_SKILL_TAGS;
  // The registry entries behind those recorded sources, keyed by skill name:
  // the store facts an on-disk record never carries (classification, the
  // install count), so the installed list can show the store's card for
  // the skills the ledger placed. Empty for tool installs — nothing to resolve.
  const storeEntries = useInstalledStoreEntries(linked);

  const list = useMemo(() => skills ?? [], [skills]);

  // Detected local skills that can be linked to store sources
  const linkableSkills = useMemo<LinkableSkill[]>(() => {
    if (!suggestions) return [];
    const result: LinkableSkill[] = [];
    for (const skill of list) {
      const isLinked = !!linked?.[skill.name]?.repo;
      if (isLinked) continue;
      const candidates = suggestions[skill.name];
      if (candidates && candidates.length > 0) {
        result.push({
          name: skill.name,
          localDescription: skill.description,
          candidates,
          recommendedCandidate: candidates[0],
        });
      }
    }
    return result;
  }, [list, linked, suggestions]);

  const [dismissedSkills, setDismissedSkills] = useState<string[]>(() => {
    try {
      const raw = sessionStorage.getItem("skill-one:source-link-dismissed");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const [batchDialogOpen, setBatchDialogOpen] = useState(false);

  const isBannerDismissed = useMemo(() => {
    if (linkableSkills.length === 0) return true;
    return linkableSkills.every((s) => dismissedSkills.includes(s.name));
  }, [linkableSkills, dismissedSkills]);

  const handleDismissBanner = useCallback(() => {
    const updated = Array.from(
      new Set([...dismissedSkills, ...linkableSkills.map((s) => s.name)]),
    );
    setDismissedSkills(updated);
    try {
      sessionStorage.setItem(
        "skill-one:source-link-dismissed",
        JSON.stringify(updated),
      );
    } catch {}
  }, [dismissedSkills, linkableSkills]);

  // What the reader is looking for and how the list reads: both are shared
  // with the store's list (see `lib/list-view`), so they are read from the
  // shared view rather than held here. The shape and the order are two
  // answers again: the list is one of skill rows or of repository cards, and
  // each reads in its own orders.
  // The full installed list is already in memory, so everything below filters on
  // the main thread.
  //
  // The field answers as it is typed, the list on the settled word: the question
  // the reader reads while typing is their own, not a half-word they have
  // already committed to. The field is what settles it (see `SearchInput`), so
  // this page is woken by a question and never by a keystroke. A live question
  // re-answers the list by relevance, which is why the order locks beside the
  // field (see `ListToolbar`).
  const query = useListQuery("installed").trim();
  const { sort = "popularity", unit = "skill" } =
    useDestinationView("installed");
  const isSearching = query.length > 0;

  // The answer this page is showing, named by the controls that produced it.
  // The view memory below keys its restore on it: a fold or a depth
  // remembered under one answer is not a place the reader was ever at under
  // another. Tag choices stay out of it, as they stay out of the panel reset
  // below: they are made inside the drawer, and re-filing rows does not
  // re-answer the page.
  const signature = `${query}\u0000${sort}\u0000${unit}`;

  // The page's own scrolling element: the list scrolls inside it, which is
  // also why the browser restores nothing for this page (see the view below).
  const listRef = useRef<HTMLDivElement | null>(null);

  // The page's remembered view: the folds and the revealed depth, plus the
  // scroll position the hook itself keeps. A page switch unmounts this
  // component, and nothing else restores a page that owns its own scroller —
  // so the view is handed to the memory on the way past and taken back on
  // return, folds and place together.
  const [view, setView] = useViewMemory<InstalledView>(
    "installed",
    { folds: {}, reveal: REVEAL[unit].initial },
    listRef,
    { ready: !isLoading && list.length > 0, signature },
  );

  // One fold's change, as the sections below read it: written into the view
  // (and so into the memory) rather than held by the section, so it outlives
  // the page.
  const setFold = useCallback(
    (key: string, open: boolean) => {
      setView((v) =>
        v.folds[key] === open
          ? v
          : { ...v, folds: { ...v.folds, [key]: open } },
      );
    },
    [setView],
  );

  // Open skill in the shared detail drawer, tracked by identity rather than by
  // index: the provenance and store-entry queries land asynchronously and
  // reshape the list under the reader's pointer, so an index captured at click
  // time could point at a different skill a moment later. The drawer resolves
  // the key against its own list, and a key it cannot find keeps it closed.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // Anything that re-answers the list resets what only described the old one:
  // the detail panel (its skill may not be in the new answer at all) and the
  // revealed depth (it belongs to the list it was revealed for). Only a
  // *change* resets: mounting with the answer already in hand is the reader
  // coming back to it, and the view they left it at is the whole point of the
  // memory above.
  const shownAnswer = useRef(signature);
  useEffect(() => {
    if (shownAnswer.current === signature) return;
    shownAnswer.current = signature;
    setSelectedKey(null);
    setView((v) =>
      v.reveal === REVEAL[unit].initial
        ? v
        : { ...v, reveal: REVEAL[unit].initial },
    );
  }, [signature, setView, unit]);

  // Deep link onto the installed list: `/installed?skill=<name>` asks the
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
  //
  // The user's tag choice is applied here, once, as the view's classification:
  // a skill filed under a tag carries that tag as its `profile`, so the
  // badges and the glyphs below all answer the choice through the same
  // classification the detail drawer reads — no second code path.
  const rows = useMemo<Row[]>(() => {
    const withTag = (skill: SkillView): SkillView => {
      const tag = assignments[skill.name];
      if (tag) return { ...skill, profile: { domain: [tag] } };
      if (skill.tags && skill.tags.length > 0) {
        return { ...skill, profile: { domain: skill.tags } };
      }
      return skill;
    };
    if (!hits) {
      return list.map((skill) => ({
        skill: withTag(
          installedSkillView(
            skill,
            linked,
            storeEntries[skill.name],
            cut?.[skill.name],
          ),
        ),
        enabled: skill.enabled,
        suggestion: suggestions?.[skill.name],
      }));
    }
    return hits.map((hit) => ({
      skill: withTag(
        installedSkillView(
          hit.doc,
          linked,
          storeEntries[hit.doc.name],
          cut?.[hit.doc.name],
        ),
      ),
      enabled: hit.doc.enabled,
      suggestion: suggestions?.[hit.doc.name],
      matched: hit.matched,
    }));
  }, [cut, hits, list, linked, storeEntries, suggestions, assignments]);

  // Linking or unlinking a source inside the detail drawer changes the
  // skill's identity (the unlinked `/name` key becomes `repo/name` and
  // back). The drawer must never render the closed state in between, so the
  // stale key is remapped during render: the name is the key's last segment
  // (the repo half of a linked key contains slashes; the name never does),
  // and the row carrying that name supplies the key's new shape. The state
  // is synced right after.
  const selectedName =
    selectedKey == null
      ? null
      : selectedKey.slice(selectedKey.lastIndexOf("/") + 1);
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
        compareByInstalledTime((row) => row.skill.installedAt, byName),
      ),
    })).toSorted((a, b) => a.repo.localeCompare(b.repo));
  }, [rows]);

  // The skill unit's flat order: the installs in the chosen grouping's order —
  // the registry's popularity blend (the default; also the within-section
  // reading the tag grouping hands its sections), or newest-first by the
  // recorded install time (see `lib/install-time`). Installs the platform
  // recorded no birth time for settle last in the time order. A search is left
  // exactly as the index answered it: relevance is a ranking too, and the
  // better one while a question is live — the same order the store keeps there.
  const activeRows = useMemo(() => {
    if (unit === "repo") return [];
    if (isSearching) return rows;
    if (sort === "installed") {
      return rows.toSorted(
        compareByInstalledTime((row) => row.skill.installedAt),
      );
    }
    if (sort === "tag") {
      const tagCounts = new Map<string, number>();
      for (const row of rows) {
        if (row.enabled) {
          const key = domainsOf(row.skill)[0];
          tagCounts.set(key, (tagCounts.get(key) ?? 0) + 1);
        }
      }
      return rows.toSorted((a, b) => {
        const tagA = domainsOf(a.skill)[0];
        const tagB = domainsOf(b.skill)[0];
        if (tagA !== tagB) {
          const countA = tagCounts.get(tagA) ?? 0;
          const countB = tagCounts.get(tagB) ?? 0;
          if (countA !== countB) return countB - countA;
          const rankA = taxonomyRank(tagA);
          const rankB = taxonomyRank(tagB);
          if (rankA !== rankB) return rankA - rankB;
          const labelDiff = domainLabel(tagA, locale).localeCompare(
            domainLabel(tagB, locale),
          );
          if (labelDiff !== 0) return labelDiff;
        }
        return compareByPopularity(
          (row: Row) => popularity(row.skill),
          (row: Row) => row.skill.installedAt,
          byName,
        )(a, b);
      });
    }
    return rows.toSorted(
      compareByPopularity(
        (row) => popularity(row.skill),
        (row) => row.skill.installedAt,
        byName,
      ),
    );
  }, [unit, rows, isSearching, sort, locale]);

  // The repository shape's flat order — the sort's own answer over cards:
  // by their repository's stars (the 按仓库 option; the figure-less pool and
  // unlisted sources sink, and cards the stars cannot separate keep the
  // newest-install order). A search answers in the shared search view instead,
  // in the shape on screen — the cards here are the browse answer's, and
  // relevance ranks skills, not repositories.
  const activeCards = useMemo<RepoGroup[]>(() => {
    if (unit !== "repo" || isSearching) return [];
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
    return cards.toSorted(
      compareByStars((card) => starsOf(card), byNewestInstall),
    );
  }, [unit, isSearching, cards]);

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

  // What the answer on screen is made of: one row or square per skill, or one
  // card per repository — the entry, not a bucket, is what the reveal counts,
  // because an entry is what every shape lists.
  const itemCount = unit === "repo" ? activeCards.length : activeRows.length;

  // Progressive rendering: only the first `renderedCount` items are mounted;
  // an IntersectionObserver on the sentinel below the list extends the count
  // while the reader scrolls. The depth lives in the page's view memory, so a
  // page switch restores it together with the scroll position; a new answer
  // (the effect on `signature`) re-seeds the run to the initial depth.
  const renderedCount = Math.min(view.reveal, itemCount);
  const done = renderedCount >= itemCount;
  const shownRows = activeRows.slice(0, renderedCount);
  const shownCards = activeCards.slice(0, renderedCount);

  // The sentinel ends the rendered run: while it is on screen the observer
  // extends the run, so scrolling down keeps revealing cards or rows until the
  // answer is fully mounted. Re-observing on every extension is what keeps the
  // reveal going while the sentinel still sits in view: observing fires the
  // initial callback with the current intersection, so a bottom edge that
  // stays visible loads the next chunk without a further scroll.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || done) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setView((v) => ({
          ...v,
          reveal: Math.min(v.reveal + REVEAL[unit].step, itemCount),
        }));
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [done, itemCount, renderedCount, setView, unit]);

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
  const splitRows = useMemo(
    () => splitByEnabled(shownRows, isRowEnabled),
    [shownRows],
  );
  const splitActive = useMemo(
    () => splitByEnabled(activeRows, isRowEnabled),
    [activeRows],
  );

  // Whether the answer is cut in two, and — when it is — the number each row
  // prints: where it stands *within its own group*, counted from 1 in each. The
  // parked half is a section of its own, with a header that states how much it
  // holds, so it numbers itself as the list it is rather than continuing the
  // live list above it.
  //
  // Counting across the split instead would be the alternative, and it is wrong
  // here for a reason worth stating: the flat order interleaves the halves, so
  // the live list would carry the gaps where a parked row used to sit (2, 4,
  // 5, 6) and the parked section would hold the very numbers the live one gave
  // up (1, 3). A run that jumps 1, 2, 4 and then restarts at 1 reads as one list
  // with rows gone missing — the opposite of what the section's own run is for.
  // Each group also numbers the order its own sort gave it, which is the only
  // order a reader looking at that group can see.
  //
  // The count survives the progressive reveal: `splitByEnabled` preserves each
  // group's order, so the revealed prefix is a prefix of the whole group and a
  // row's number never shifts under the reader as more is revealed.
  const split = splitRows.disabled.length > 0;

  // The live answer, divided into titled sections when the chosen grouping
  // provides semantic buckets (按安装时间分组 files each install into the time
  // bucket its age falls in: 今天 / 昨天 / 最近 7 天 / 最近 30 天 / 更早;
  // 按标签分组 files each install under its leading classification).
  // Under the default popularity sort, live installs render directly without
  // artificial grouping.
  // Empty sections are not drawn — an absent bucket reads quieter than a zero. The
  // count beside a header states what the section holds: for the tag grouping
  // that is the whole answer's size (the ranking pass already reads the rows
  // the reveal has not mounted), so a header never rewrites itself mid-scroll;
  // for the install clock it is what the revealed rows have filled so far.
  const sections = useMemo<
    { title: string; emoji?: string; rows: Row[]; total?: number }[]
  >(
    () => {
    const live = splitRows.enabled;
    if (live.length === 0) return [];
    if (sort === "tag") {
      const liveActive = splitActive.enabled;
      const activeByTag = new Map<string, Row[]>();
      for (const row of liveActive) {
        const key = domainsOf(row.skill)[0];
        const bucket = activeByTag.get(key);
        if (bucket) bucket.push(row);
        else activeByTag.set(key, [row]);
      }

      const orderedTags = Array.from(activeByTag.entries()).toSorted(
        ([keyA, itemsA], [keyB, itemsB]) =>
          itemsB.length - itemsA.length ||
          taxonomyRank(keyA) - taxonomyRank(keyB) ||
          domainLabel(keyA, locale).localeCompare(domainLabel(keyB, locale)),
      );

      const shownByTag = new Map<string, Row[]>();
      for (const row of live) {
        const key = domainsOf(row.skill)[0];
        const bucket = shownByTag.get(key);
        if (bucket) bucket.push(row);
        else shownByTag.set(key, [row]);
      }

      const groups: {
        title: string;
        emoji: string;
        rows: Row[];
        total: number;
      }[] = [];
      for (const [key] of orderedTags) {
        const tagRows = shownByTag.get(key);
        if (tagRows && tagRows.length > 0) {
          groups.push({
            title: domainLabel(key, locale),
            // The classification's own mark, the same resolver the row
            // badges and the tag picker call — a header reads like the
            // tags it stands for, emoji and all.
            emoji: domainEmoji([key]),
            rows: tagRows,
            // The whole answer's size for this tag, from the ranking pass
            // that already reads the unrevealed rows: the header states how
            // many skills the section holds from the first frame on, and
            // the reveal below only decides how many of them are mounted.
            total: activeByTag.get(key)?.length ?? tagRows.length,
          });
        }
      }
      return groups;
    }
    if (sort === "installed") {
      const buckets: Row[][] = TIME_BUCKETS.map(() => []);
      for (const row of live) {
        const stamp = row.skill.installedAt;
        const ageDays =
          stamp == null ? null : (Date.now() / 1000 - stamp) / DAY_SECONDS;
        const index =
          ageDays == null
            ? TIME_BUCKETS.length - 1
            : TIME_BUCKETS.findIndex(
                (bucket) =>
                  bucket.maxAgeDays !== null && ageDays < bucket.maxAgeDays,
              );
        buckets[index === -1 ? TIME_BUCKETS.length - 1 : index].push(row);
      }
      return TIME_BUCKETS.map((bucket, index) => ({
        title: t(bucket.titleKey),
        rows: buckets[index],
      })).filter((section) => section.rows.length > 0);
    }
    return [];
    },
    [splitRows, splitActive, sort, t, locale],
  );

  // Whether the answer is cut in two, and — when it is — the number each row
  // prints: where it stands *within its own group*, counted from 1 in each. The
  // parked half is a section of its own, with a header that states how much it
  // holds, so it numbers itself as the list it is rather than continuing the
  // live list above it.
  //
  // Counting across the split instead would be the alternative, and it is wrong
  // here for a reason worth stating: the flat order interleaves the halves, so
  // the live list would carry the gaps where a parked row used to sit (2, 4,
  // 5, 6) and the parked section would hold the very numbers the live one gave
  // up (1, 3). A run that jumps 1, 2, 4 and then restarts at 1 reads as one list
  // with rows gone missing — the opposite of what the section's own run is for.
  // Each group also numbers the order its own sort gave it, which is the only
  // order a reader looking at that group can see.
  //
  // The count survives the progressive reveal: `splitByEnabled` preserves each
  // group's order, so the revealed prefix is a prefix of the whole group and a
  // row's number never shifts under the reader as more is revealed.
  //
  // Under 按标签分组 the groups are the sections above, so the run restarts
  // with each tag: a row numbers its place within its own tag, and the
  // podium is that tag's three most-popular installs. The parked half numbers
  // itself as it does under every grouping.
  const rowOrdinals = useMemo(() => {
    const ordinals = new Map<string, number>();
    if (sort === "tag") {
      for (const section of sections) {
        section.rows.forEach((row, index) =>
          ordinals.set(skillKey(row.skill), index),
        );
      }
      splitRows.disabled.forEach((row, index) =>
        ordinals.set(skillKey(row.skill), index),
      );
    } else {
      for (const group of [splitRows.enabled, splitRows.disabled]) {
        group.forEach((row, index) => ordinals.set(skillKey(row.skill), index));
      }
    }
    return ordinals;
  }, [sort, sections, splitRows]);

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
      unit === "repo"
        ? activeCards.flatMap((card) => card.items.map((row) => row.skill))
        : [...splitActive.enabled, ...splitActive.disabled].map(
            (row) => row.skill,
          ),
    [unit, splitActive, activeCards],
  );

  // A retag lands while the drawer is open on the skill being filed, so it
  // must not reset the selection the way a sort change does: the drawer
  // stays and its badge answers the new choice live. Tag choices never file
  // the open skill out of this answer — the list no longer narrows by
  // classification — so the drawer walks the answer as it is.

  // What stands in for the owner face on a skill the ledger placed no
  // repository for: the third-party mark, which is itself the way to give it
  // one whenever the registry knows a namesake. An install the ledger did
  // place has a repository to show, and no mark at all.
  //
  // The size is the caller's because the face's slot is sized by the surface
  // that owns it — a square is a step below a row, and the mark has to fill
  // whichever box it lands in exactly as the owner's face does.
  const rowExtra = useCallback(
    (row: Row, className: string) =>
      !row.skill.repo ? (
        <LinkSuggestionMark
          name={skillDisplayName(row.skill)}
          localDescription={row.skill.description}
          candidates={row.suggestion ?? []}
          cutRepos={row.skill.cutRepos}
          className={className}
        />
      ) : undefined,
    [],
  );

  // This list's own answer as the shared search view reads it, built once per
  // answer rather than on every render. Handed over inline it would be a fresh
  // array of fresh rows each time, so the view would re-file the answer by
  // repository and re-order the groups for a page that had not changed — and
  // every row would be handed a new corner action, re-rendering the lot (see
  // `SkillRow`).
  const searchRows = useMemo<SearchRow[]>(
    () =>
      rows.map((row) => ({
        skill: row.skill,
        matched: row.matched,
        muted: !row.enabled,
        extra:
          unit !== "repo"
            ? rowExtra(
                row,
                unit === "grid" ? "size-10 text-xs" : "size-7 text-xs",
              )
            : undefined,
        action: <SkillEnableSwitch skill={row.skill} />,
      })),
    [rows, rowExtra, unit],
  );

  const queryClient = useQueryClient();
  const multiSelect = useMultiSelect<string>();
  const [bulkLoading, setBulkLoading] = useState(false);

  const handleBatchLink = useCallback(
    async (
      selections: readonly {
        name: string;
        repo: string;
        defaultTags?: readonly string[];
      }[],
    ) => {
      try {
        const entries = selections.map((item) => ({
          name: item.name,
          repo: item.repo,
          reason: "confirm" as const,
          defaultTags: item.defaultTags,
        }));
        await recordSkillProvenanceBatch(entries);
        await markSkillsChanged(queryClient);
        toast.add({
          title: t("sourceLink.batchLinkSuccess", { count: entries.length }),
          type: "success",
        });
      } catch {
        toast.add({
          title: t("sourceLink.batchLinkFailed"),
          type: "error",
        });
      }
    },
    [queryClient, t],
  );

  const handleLinkAllRecommended = useCallback(async () => {
    const selections = linkableSkills.map((s) => ({
      name: s.name,
      repo: s.recommendedCandidate.skill.repo,
      defaultTags: s.recommendedCandidate.skill.profile?.domain,
    }));
    await handleBatchLink(selections);
  }, [linkableSkills, handleBatchLink]);

  const allVisibleKeys = useMemo(
    () => rows.map((r) => skillKey(r.skill)),
    [rows],
  );

  const availableTags = useMemo<SelectionTagOption[]>(() => {
    const customDefs = (customTags?.tagDefs ?? []).map((def) => ({
      key: def.key,
      label: def.label,
      emoji: def.emoji,
      isCustom: true,
    }));
    const systemDefs = DOMAINS.map((dom) => ({
      key: dom.key,
      label: domainLabel(dom.key, locale),
      emoji: domainEmoji([dom.key]),
      isCustom: false,
    }));
    return [...customDefs, ...systemDefs];
  }, [customTags, locale]);

  const { clear: clearSelection, count: selectedCount } = multiSelect;
  useEffect(() => {
    if (unit === "repo" && selectedCount > 0) {
      clearSelection();
    }
  }, [unit, selectedCount, clearSelection]);

  const getSelectedNames = () =>
    multiSelect.selectedList.map((k) => k.slice(k.lastIndexOf("/") + 1));

  const handleBulkEnable = async () => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    setBulkLoading(true);
    try {
      await setManySkillsEnabled(selectedNames, true);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.enableSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("action.toggleFailed")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDisable = async () => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    setBulkLoading(true);
    try {
      await setManySkillsEnabled(selectedNames, false);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.disableSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("action.toggleFailed")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkTag = async (tagKey: string | null) => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    setBulkLoading(true);
    try {
      await setManySkillTags(selectedNames, tagKey);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.tagSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("tag.failed")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleCreateAndApplyTag = async (label: string, emoji?: string) => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    const taken = collectTakenTagKeys(
      (customTags?.tagDefs ?? []).map((def) => def.key),
    );
    const checked = validateNewTag(label, taken);
    if (!checked.ok) {
      const errMap: Record<TagValidationError, string> = {
        empty: t("tag.errorEmpty"),
        tooLong: t("tag.errorTooLong"),
        reserved: t("tag.errorReserved"),
        duplicate: t("tag.errorDuplicate"),
        emojiLong: t("tag.errorEmojiLong"),
      };
      toast.add({ title: errMap[checked.error], type: "error" });
      return;
    }
    setBulkLoading(true);
    try {
      await saveCustomTagDef(checked.key, label.trim(), emoji);
      await setManySkillTags(selectedNames, checked.key);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.tagSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("tag.failed")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    const selectedNames = getSelectedNames();
    if (selectedNames.length === 0) return;
    setBulkLoading(true);
    try {
      await removeInstalledSkills(selectedNames);
      await markSkillsChanged(queryClient);
      toast.add({
        title: t("multiSelect.uninstallSuccess", { count: selectedNames.length }),
        type: "success",
      });
      clearSelection();
    } catch (e) {
      toast.add({
        title: errorMessage(e, t("action.retry")),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  /**
   * One row of the skill unit. Shared by every rank section and the parked one
   * so a skill reads the same in all of them — the only thing that says which
   * section it is in is the section it is drawn under, never the row itself.
   * The ordinal is its position among the live installs, which is why the row
   * is rendered by the same code everywhere: neither the row nor this function
   * knows which section it is for.
   */
  const renderSkillRow = (row: Row) => {
    const key = skillKey(row.skill);
    return (
      <SkillRow
        key={key}
        skill={row.skill}
        index={rowOrdinals.get(key) ?? 0}
        // The row numbers its position in the order the reader picked, and the
        // first three of that order wear the podium — the same mark in every
        // unit and in both shapes, so an installed skill reads the same
        // wherever it is listed. The claim is about the *chosen* order, not
        // about weight: under 按安装时间分组 the podium is the three newest
        // installs, and this list is content to call that a ranking, because
        // that is the order the reader asked to read by.
        fact={sort === "installed" ? "installedAt" : "popularity"}
        selected={key === selected}
        muted={!row.enabled}
        extra={rowExtra(row, "size-7 text-xs")}
        action={<SkillEnableSwitch skill={row.skill} />}
        onSelect={setSelectedKey}
        checkable={true}
        checked={multiSelect.isSelected(key)}
        onCheckChange={() => multiSelect.toggle(key)}
        selectionMode={multiSelect.isSelectionMode}
        showUnclassified={false}
      />
    );
  };

  /**
   * One square of the grid unit. Same facts as the row above, minus the
   * ordinal: squares carry no ranking column, so there is no number to print.
   */
  const renderSkillGrid = (row: Row) => {
    const key = skillKey(row.skill);
    return (
      <SkillGridCard
        key={key}
        skill={row.skill}
        fact={sort === "installed" ? "installedAt" : "popularity"}
        selected={key === selected}
        muted={!row.enabled}
        extra={rowExtra(row, "size-10 text-xs")}
        action={<SkillEnableSwitch skill={row.skill} />}
        onSelect={() => setSelectedKey(key)}
        checkable={true}
        checked={multiSelect.isSelected(key)}
        onCheckChange={() => multiSelect.toggle(key)}
        selectionMode={multiSelect.isSelectionMode}
        showUnclassified={false}
      />
    );
  };

  /**
   * One section's worth of the per-skill shapes, drawn as the list it is —
   * rows or squares per the shape on screen.
   */
  const skillEntries = (group: Row[]) =>
    unit === "grid" ? (
      <ul className={SKILL_GRID_LIST_CLASS}>{group.map(renderSkillGrid)}</ul>
    ) : (
      <ul className={SKILL_ROW_LIST_CLASS}>{group.map(renderSkillRow)}</ul>
    );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The list's own first row, and the only row above the answer: the
          field that names what the reader is looking for, the shape switch,
          and the sort switch that says what order the list reads in. The
          order locks while a question is live — a search re-ranks by
          relevance. The row's arrangement is `ListToolbar`'s to answer; the
          page hands over whether the question has settled. */}
      <ListToolbar
        destination="installed"
        searching={isSearching}
      />

      {!isSearching && !isBannerDismissed && linkableSkills.length > 0 && (
        <SourceLinkBanner
          skills={linkableSkills}
          onLinkAll={handleLinkAllRecommended}
          onOpenReview={() => setBatchDialogOpen(true)}
          onDismiss={handleDismissBanner}
        />
      )}

      {/* The list — repository cards, skill rows or grid squares; the modal
          detail drawer overlays any without reflowing it or moving its scroll
          position. The element is the page's own scroller, whose position the
          view memory keeps (see `listRef`). */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={listRef}
          className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5"
        >
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
              rows={unit === "repo" ? SKELETON_CARDS : SKELETON_ROWS}
              listClassName={
                unit === "repo"
                  ? REPO_LIST_CLASS
                  : unit === "grid"
                    ? SKILL_GRID_LIST_CLASS
                    : SKILL_ROW_LIST_CLASS
              }
              itemClassName={
                unit === "repo"
                  ? REPO_CARD_SKELETON_CLASS
                  : unit === "grid"
                    ? SKILL_GRID_SKELETON_CLASS
                    : SKILL_ROW_SKELETON_CLASS
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
              installed={searchRows}
            />
          ) : unit === "repo" ? (
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
                  showUnclassified={false}
                  skills={card.items.map((row) => ({
                    skill: row.skill,
                    muted: !row.enabled,
                    extra:
                      !card.repo && row.suggestion && row.suggestion.length > 0 ? (
                        <LinkSuggestionMark
                          name={row.skill.name}
                          localDescription={row.skill.description}
                          candidates={row.suggestion}
                          cutRepos={row.skill.cutRepos}
                          className="size-4"
                        />
                      ) : undefined,
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
                      label={card.repo || t("common.thirdPartyInstall")}
                    />
                  }
                />
              ))}
            </ul>
          ) : (
            // The per-skill shapes: one row or one square per install. Under
            // the popularity sort, live installs render directly as a continuous
            // flat list without artificial grouping slices. Under the install clock
            // or tag sort, live installs are divided into titled collapsible
            // sections (time buckets: 今天 / 昨天 / 最近 7 天 / 最近 30 天 / 更早;
            // or classifications).
            // Parked (disabled) installs sit below under their own collapsible section.
            //
            // The parked section exists only once something is parked, and it
            // starts folded: those skills were set aside, so on arrival the
            // page is the live list alone and the header's count is what
            // says there is more below. An absent section still reads quieter
            // than a zero-count one.
            <>
              {sort === "popularity"
                ? splitRows.enabled.length > 0 &&
                  skillEntries(splitRows.enabled)
                : sections.map((section) => (
                    <CollapsibleSection
                      key={section.title}
                      glyph={section.emoji}
                      title={section.title}
                      // The tag grouping states the section's whole size — the
                      // answer already knows it, and a header that rewrote its
                      // own count as the reveal grew would read as a list
                      // changing, not a list arriving. The time buckets keep
                      // the literal count: their sections are cut from the
                      // revealed rows alone, so what they hold is what they
                      // have shown.
                      count={t("state.skillCount", {
                        count: section.total ?? section.rows.length,
                      })}
                      // The fold is remembered with the page's view: it comes
                      // back with a page switch, and a section of the same
                      // name under a later grouping starts from its own
                      // default only when the reader never touched it.
                      open={view.folds[foldKey(section.title)] ?? true}
                      onOpenChange={(open) =>
                        setFold(foldKey(section.title), open)
                      }
                    >
                      {skillEntries(section.rows)}
                    </CollapsibleSection>
                  ))}
              {split && (
                <CollapsibleSection
                  icon={PowerOff}
                  title={t("list.disabled")}
                  count={t("state.skillCount", {
                    count: splitRows.disabled.length,
                  })}
                  // The fold is the reader's ("not working with these right
                  // now"), so it survives a change of grouping — which only
                  // re-orders or re-slices rows — and a page switch, like the
                  // sections' folds above.
                  open={view.folds.parked ?? false}
                  onOpenChange={(open) => setFold("parked", open)}
                  className={cn(
                    "border-t border-border/60 pt-6",
                    splitRows.enabled.length > 0 && "mt-6",
                  )}
                >
                  {skillEntries(splitRows.disabled)}
                </CollapsibleSection>
              )}
            </>
          )}
          {/* The sentinel the observer above watches. */}
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

      <SourceLinkBatchDialog
        open={batchDialogOpen}
        onOpenChange={setBatchDialogOpen}
        skills={linkableSkills}
        onConfirm={handleBatchLink}
      />

      {unit !== "repo" && (
        <SelectionActionBar
          count={multiSelect.count}
          totalCount={allVisibleKeys.length}
          onSelectAll={() => multiSelect.selectAll(allVisibleKeys)}
          onClear={clearSelection}
          onEnable={handleBulkEnable}
          onDisable={handleBulkDisable}
          onTag={handleBulkTag}
          onCreateTag={handleCreateAndApplyTag}
          availableTags={availableTags}
          onDelete={handleBulkDelete}
          loading={bulkLoading}
        />
      )}
    </div>
  );
}
