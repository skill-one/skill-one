import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Boxes, Users } from "lucide-react";

import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useInstalledStoreEntries } from "../../hooks/use-installed-store-entries";
import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useRepoCardLimit } from "../../hooks/use-repo-card-limit";
import { installedSkillView, type SkillView } from "../../lib/skill-view";
import { domainLabel, domainMeta } from "../../data/domains";
import { domainFacets, domainsOf } from "../../lib/domain-filter";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
} from "../../lib/skill-list-layout";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { Placeholder } from "../../components/placeholder";
import { errorMessage } from "../../lib/utils";
import { buildSearchIndex } from "../../lib/search-index";
import { SearchInput } from "../../components/search-input";
import type { SkillMatched } from "../../components/skill-card";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
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

/** React-key identity of the pool card: skills no recorded source vouches for. */
const LOCAL_POOL_KEY = "local";

/** Where the pool card's bar leads: the page that lists the pool whole. */
const LOCAL_POOL_PATH = "/my-skills/local";

/** One installed skill, precomputed where the list is built. */
interface Row {
  view: SkillView;
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
  const first = group.items[0]?.view;
  return first?.storeBacked ? first.stars : undefined;
}

/**
 * The installed list — the management counterpart of the store's 全部 page, in
 * the same unit: **one card per source repository**, listing that repository's
 * installed skills (up to the preview size set in Settings, 5 by default) and
 * signed off by the bar that names the repository and opens its page.
 *
 * Installs no recorded source vouches for have no repository to belong to, so
 * they pool into one card of their own rather than inventing one — the same
 * shape, with its bar stating 本地安装 in place of a repository it would have to
 * make up, and opening the page that lists the pool whole.
 *
 * What the page adds to the store's card is what only an installed skill has:
 * the enable switch in each row's action slot (drawn always — a reader
 * scanning for a disabled skill must see it without pointing), the dimming of a
 * disabled row, and the migration badge beside an install whose source the
 * ledger cannot vouch for.
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

  // The search text and the domain scope are local state — the full installed
  // list is already in memory, so everything below filters on the main thread.
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState<string | null>(null);
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
  };
  const handleDomain = (next: string | null) => {
    if (next === domain) return;
    setDomain(next);
    setSelectedKey(null);
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
      view: installedSkillView(skill, linked, storeEntries[skill.name]),
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
      const bucket = byRepo.get(row.view.repo);
      if (bucket) bucket.push(row);
      else byRepo.set(row.view.repo, [row]);
    }
    return Array.from(byRepo, ([repo, items]) => ({ repo, items })).toSorted(
      (a, b) => b.items.length - a.items.length || a.repo.localeCompare(b.repo),
    );
  }, [rows]);

  // The category chips count cards: a card rides every domain its rows belong
  // to, and an unclassified install pools into the catch-all.
  const chips = useMemo(
    () =>
      domainFacets(cards, (card) => {
        const keys = new Set<string>();
        for (const row of card.items) {
          for (const key of domainsOf(row.view)) keys.add(key);
        }
        return Array.from(keys);
      }),
    [cards],
  );

  // The list on screen. The domain scope is a browse control: a search
  // re-orders the list by relevance and ignores it (the chip row stands down),
  // the same division of labour the store's filter has.
  const visible = useMemo(
    () =>
      isSearching || domain === null
        ? cards
        : cards.filter((card) =>
            card.items.some((row) => domainsOf(row.view).includes(domain)),
          ),
    [cards, isSearching, domain],
  );

  // Progressive rendering: only the first `renderedCount` cards are mounted;
  // an IntersectionObserver on the sentinel below the list extends the count
  // while the reader scrolls. A new answer (a search, a scope, a reshaped list)
  // re-seeds the run to the same depth.
  const {
    count: renderedCount,
    sentinelRef,
    done,
  } = useProgressiveReveal({
    total: visible.length,
    initial: INITIAL_CARDS,
    step: CARD_CHUNK,
    resetKey: `${query}\u0000${domain ?? "all"}\u0000${list.length}`,
  });
  const shown = visible.slice(0, renderedCount);

  // The drawer walks every skill of the visible cards, capped rows included:
  // a card's preview is a rendering choice, not the list's extent.
  const detailSkills = useMemo(
    () => visible.flatMap((card) => card.items.map((row) => row.view)),
    [visible],
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-5 pb-5">
      {/* Toolbar, styled like the store's: the search field first, the
          installed list's own control (the agent strip) out at the far edge. */}
      <div className="mb-4 flex items-center gap-3">
        <SearchInput value={search} onChange={handleSearch} label="搜索 Skill" />

        <div className="ml-auto flex items-center gap-2">
          <AgentAvatarMenu />
        </div>
      </div>

      {/* The category filter: every classification that holds an installed
          skill, flat, one press to scope the list (全部 clears it). It is a
          browse control — a search re-orders the list by relevance and ignores
          it — so it stands only while browsing. */}
      {!isSearching && cards.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <DomainChip
            selected={domain === null}
            count={cards.length}
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
              onClick={() => handleDomain(key)}
            >
              {domainLabel(key)}
            </DomainChip>
          ))}
        </div>
      )}

      {/* The repository cards; the modal detail drawer overlays them without
          reflowing them or moving their scroll position. */}
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
              rows={SKELETON_CARDS}
              listClassName={REPO_LIST_CLASS}
              itemClassName={REPO_CARD_SKELETON_CLASS}
            />
          ) : list.length === 0 ? (
            <Placeholder icon={Boxes} message="还没有安装任何技能" />
          ) : visible.length === 0 ? (
            <Placeholder
              message={
                query ? `未找到匹配“${query}”的 Skill` : "没有符合条件的仓库"
              }
            />
          ) : (
            <ul className={REPO_LIST_CLASS}>
              {shown.map((card) => (
                <RepoCard
                  key={card.repo || LOCAL_POOL_KEY}
                  repo={card.repo}
                  stars={starsOf(card)}
                  skills={card.items.map((row) => ({
                    skill: row.view,
                    matched: row.matched,
                    muted: !row.enabled,
                    // The migration affordance is only meaningful while the
                    // source is unknown; a recorded one needs no route to the
                    // store.
                    extra:
                      !row.view.repo && row.suggestion?.length ? (
                        <LinkSuggestionBadge
                          name={row.view.name}
                          candidates={row.suggestion}
                        />
                      ) : undefined,
                    action: <SkillEnableSwitch skill={row.view} />,
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
              cards until the answer is fully mounted. */}
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
