import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Boxes, Globe, Loader2, Store } from "lucide-react";

import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useSkillsShSearch } from "../../hooks/use-skills-sh-search";
import { openExternal } from "../../lib/open-external";
import { skillKey, type SkillView } from "../../lib/skill-view";
import type { Destination, ListUnit } from "../../lib/list-view";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_GRID_LIST_CLASS,
  SKILL_GRID_SKELETON_CLASS,
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import type { SkillMatched } from "../../components/highlighted-text";
import { CollapsibleSection } from "../../components/collapsible-section";
import { RepoEnableSwitch } from "../../components/repo-enable-switch";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Placeholder } from "../../components/placeholder";
import { SkeletonList } from "../../components/skeleton-list";
import { buildLiveRepoGroups } from "./live-groups";
import { SkillGridCard } from "./skill-grid-card";
import { SkillRow } from "./skill-row";
import { RepoCard } from "./repo-card";

/**
 * The search answer, read wherever a list asks the shared query. Both surfaces
 * answer in the same shape, and which source falls into which slot is a fact
 * about that source rather than about the list — which is what makes the two
 * read as one behaviour instead of two.
 *
 * **Every source is a titled group, open by default** (`CollapsibleSection`).
 * Three sources answer one question, and a group is how a reader tells them
 * apart at a glance: the name says which source a row came from, the count says
 * how much of it there is, and the fold lets a reader who only wants one
 * source's answer fold the other two away. The sections read in the order of
 * trust and cost — this machine's own records, then the registry's daily
 * snapshot, then skills.sh's live catalogue — so the answer nearest the top is
 * the one that can be acted on here and now, and the one at the bottom is
 * reach: the skills this app has not published yet.
 *
 * **Nothing is hidden behind a press.** A search that has already cost the
 * reader a query has also told us they want the answer, so every source is
 * asked as the query settles — including skills.sh, the one cross-network
 * request, which is bounded by the endpoint's own two-character floor and a
 * five-minute cache. Its section carries a skeleton of the unit's own shape
 * while it is in flight, so the answer lands *into* the layout rather than onto
 * it, and a reader who finds nothing in the groups above can simply keep
 * reading: the live group is already open below them.
 *
 * **A source with nothing to say renders nothing at all** — an absent group
 * reads quieter than a zero, and a header over an empty panel is a claim the
 * page cannot back. The one exception is a source still answering, which shows
 * its skeleton so its eventual absence is a real answer rather than a guess.
 *
 * **Except the asking list's own source, which leaves one quiet line.** Three
 * groups where one of them belongs to *this* list is not the same as three
 * equal sources: a reader who searched 「已安装」 and finds rows under no
 * 「已安装」 header reads them as installs until they happen to look up and
 * find a different source's name. The scope change has to be stated, so an
 * empty own source says so in a single muted line in the slot its group would
 * have held — which is cheap, and a far cry from the full-height empty state
 * that used to sit there with the way onward hidden behind a press. It is
 * **centred** (see `ownNote`) and it keeps the source's glyph, so it names the
 * scope it speaks for while reading as a notice rather than as a header. It
 * yields to the whole-search empty state below, which already speaks for this
 * source too: one fact does not need saying twice.
 *
 * **The empty state is the whole search's verdict, not one source's.** It
 * appears only once every source has come back empty — a page that says "no
 * matches" above a full page of results is lying about its own contents, and
 * the per-source wording that used to sit there is exactly that lie.
 *
 * Every group reads in the same shape per unit, so a skill looks the same
 * wherever it is found, and the store's live group is deduplicated against the
 * registry's: two indexes carrying one skill is one row, not two.
 *
 * The detail drawer walks the answer a row was opened in, wearing that answer's
 * surface — the installed list's own rows carry the enable switch, the store's
 * rows the install CTA — so the open skill is addressed by group plus identity.
 * The live rows open skills.sh in the browser instead, so they are in no walk.
 *
 * Both fetches live here rather than in the pages: the component is rendered
 * exactly while a search is live, so the queries enable themselves, and both
 * pages answer one question through one piece of code. Only the installed rows
 * arrive as props — they are render-ready (the page injects the surface's own
 * action), and the page alone knows the ledger and the link suggestions behind
 * them.
 */

/** One render-ready row of the installed section. */
export interface SearchRow {
  skill: SkillView;
  /** Search-hit highlights, so a searched name reads like the store's. */
  matched?: SkillMatched;
  /** Dimmed presentation: the installed list's disabled install. */
  muted?: boolean;
  /** Trails the facts cluster: the migration badge on an unlinked install. */
  extra?: ReactNode;
  /** The row's corner control; absent means the store's install button. */
  action?: ReactNode;
}

/** React-key identity of the pool card. */
const LOCAL_POOL_KEY = "local";

/**
 * How much of the registry's answer mounts with the question, and how much more
 * each scroll to the end of it brings. A chunk is a screenful rather than a
 * token number: the answer should be readable before the reader has scrolled at
 * all, which is the whole difference between a search that feels instant and one
 * that feels like it is still working.
 */
const INITIAL_HITS = 12;
const HIT_CHUNK = 12;

export function SearchResults({
  unit,
  query,
  destination,
  installed = [],
}: {
  /** The unit every section is read in. */
  unit: ListUnit;
  /** The settled query; the live rows' highlight terms derive from it. */
  query: string;
  /**
   * Which surface is asking — and so which source leads the answer, and which
   * read as a second group below it (see the component note). The store leads
   * with the registry's index and asks nothing of this machine's records; the
   * installed list leads with what it has and reads the registry below as one
   * more source.
   */
  destination: Destination;
  /**
   * The installed answer, render-ready. The installed list hands one over as its
   * own group and the store's answer holds no section for it, and an absent
   * prop says so.
   */
  installed?: SearchRow[];
}) {
  const { t } = useTranslation();
  // Which source leads the answer is the asking surface's own: the store reads
  // the registry, the installed list reads this machine's own records, and each
  // reads the other as one more group below its own.
  const remote = destination !== "installed";
  // The registry's index is cheap and certain — it is already in the worker's
  // memory — so it is asked for the moment a search is live on either surface.
  const groupsQuery = useRegistryGroups(query);
  const storeLoading = groupsQuery.isLoading;
  // Memoized so the derivations below keep stable inputs across renders.
  const storeGroups = useMemo(
    () => groupsQuery.data?.groups ?? [],
    [groupsQuery],
  );

  // The live skills.sh answer is asked for as the query settles: a reader who
  // typed a question wants the whole answer, and the endpoint's own floor plus
  // the five-minute cache are what bound the cost of asking.
  const { data: liveData, isFetching: liveSearching } = useSkillsShSearch(query);

  const storeHits = useMemo(
    () => storeGroups.flatMap((group) => group.skills),
    [storeGroups],
  );
  const storeSkills = useMemo(
    () => storeHits.map((hit) => hit.skill),
    [storeHits],
  );

  // **The registry is the one source here with no ceiling of its own.** The two
  // others are bounded by what they are: this machine's installs by what the
  // reader has, skills.sh by the limit the answer is asked with. A broad word
  // over a multi-thousand-entry registry, on the other hand, matches thousands
  // of skills — and mounting every one of them at once is a stall the reader
  // would read as the app having hung, which is the last thing a search that
  // already cost them a keystroke's worth of waiting should add. So this answer
  // is revealed a chunk at a time, by the same mechanism the browse lists use
  // (see `useProgressiveReveal`): nothing is withheld, it simply starts arriving
  // at once instead of all at once.
  const {
    count: storeShown,
    sentinelRef: storeSentinel,
    done: storeRevealed,
  } = useProgressiveReveal({
    // The repository unit lists repositories; the two skill shapes (rows and
    // the compact grid) list skills, one entry each either way.
    total: unit === "repo" ? storeGroups.length : storeHits.length,
    initial: INITIAL_HITS,
    step: HIT_CHUNK,
    resetKey: `${unit}\u0000${query}`,
  });

  // The live answer: what the store's does not already cover. Identity is the
  // whole comparison — the same `repo/name` pair both sides key a skill by —
  // so a skill upstream also carries never lists twice in one answer.
  const liveSkills = useMemo(() => {
    const indexed = new Set(storeSkills.map(skillKey));
    return (liveData ?? []).filter((s) => !indexed.has(skillKey(s)));
  }, [liveData, storeSkills]);
  const liveRepoGroups = useMemo(
    () => buildLiveRepoGroups(liveSkills),
    [liveSkills],
  );
  // The endpoint answers no matched terms, so the query's own words stand in
  // for the live rows' highlight. Held as the row's own `{ name }` shape once
  // rather than rebuilt per row, so a settled answer re-renders no row that did
  // not change (see `SkillRow`).
  const liveMatched = useMemo(
    () => ({ name: query.split(/\s+/).filter(Boolean) }),
    [query],
  );

  // The open skill, addressed by the answer it was opened in plus its identity:
  // the installed list puts the store's own rows under its own rows (see the
  // component note), and those two answers wear different surfaces.
  const [opened, setOpened] = useState<{
    answer: "own" | "store";
    key: string;
  } | null>(null);

  // The installed section's repository cards, most-populated first (ties by
  // name); the skills no recorded source vouches for pool into the one card
  // that stands for them, so every installed hit still lives somewhere.
  const installedCards = useMemo(() => {
    const byRepo = new Map<string, SearchRow[]>();
    for (const row of installed) {
      const bucket = byRepo.get(row.skill.repo);
      if (bucket) bucket.push(row);
      else byRepo.set(row.skill.repo, [row]);
    }
    return Array.from(byRepo, ([repo, items]) => ({ repo, items })).toSorted(
      (a, b) => b.items.length - a.items.length || a.repo.localeCompare(b.repo),
    );
  }, [installed]);

  // The drawer's walk: the answer the open skill was opened in, in the order
  // that answer lists it, wearing that answer's surface. One answer on the
  // store's list; two on the installed list's. The live group is in no walk:
  // its rows open skills.sh.
  const ownBlock = remote
    ? ({ answer: "own", skills: storeSkills, surface: "store" } as const)
    : ({
        answer: "own",
        skills: installed.map((row) => row.skill),
        surface: "installed",
      } as const);
  const storeBlock = {
    answer: "store",
    skills: storeSkills,
    surface: "store",
  } as const;
  const drawer = opened?.answer === "store" ? storeBlock : ownBlock;

  // What each source is still doing, and what it came back with. A source that
  // has answered empty is absent; a source still answering shows its skeleton,
  // so its eventual absence is a verdict rather than a gap.
  const ownLoading = remote && storeLoading;
  const ownCount = remote ? storeGroups.length : installedCards.length;
  // The own source's glyph, named once because both its group header and the
  // quiet line below draw it. See the note on `ownNote` for why the line wears
  // it at all.
  const OwnIcon = remote ? Store : Boxes;

  /**
   * Which answer a row belongs to: the asking list's own, or the store's group
   * below the installed list's.
   */
  type Answer = "own" | "store";
  // Rows address the selection the way they are addressed — which answer they
  // belong to, plus their own key — so neither has to restate the other's.
  const isOpen = (answer: Answer, key: string) =>
    opened?.answer === answer && opened.key === key;
  // One handler per answer, held across renders: the rows are memoized, so a
  // handler rebuilt on the way down would hand every row of a long answer a new
  // prop and re-render all of them to no end (see `SkillRow`).
  const openOwn = useCallback(
    (key: string) => setOpened({ answer: "own", key }),
    [],
  );
  const openStore = useCallback(
    (key: string) => setOpened({ answer: "store", key }),
    [],
  );
  const openRowOf = (answer: Answer) =>
    answer === "own" ? openOwn : openStore;
  const openCard = (answer: Answer) =>
    (key: string | null) =>
      setOpened(key == null ? null : { answer, key });
  // A live row opens skills.sh rather than anything this app can fill, so its
  // handler addresses the same key the other rows do and finds the URL itself.
  const openLive = useCallback(
    (key: string) => {
      const live = liveSkills.find((s) => skillKey(s) === key);
      if (live?.url) void openExternal(live.url);
    },
    [liveSkills],
  );

  // The count a group states, in the unit on screen: repositories weigh
  // repositories, skills weigh skills, and a source still answering says so
  // rather than claiming a number it does not have yet.
  const count = (loading: boolean, amount: number) =>
    loading
      ? t("search.searching")
      : unit === "repo"
        ? t("state.repoCount", { count: amount })
        : t("state.skillCount", { count: amount });

  // A skeleton of the unit's own shape, so a group that has not answered yet
  // holds the space its entries will land in.
  const skeleton = (
    <SkeletonList
      rows={3}
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
  );

  // The store's grouped answer in the unit's own shape — the store list's own
  // group, and the installed list's second group, read from the same place.
  // Both are revealed in chunks (see `useProgressiveReveal` above), so the run's
  // sentinel closes the list and the observer extends it as the reader reaches
  // the end.
  const storeAnswer = (answer: Answer) => (
    <>
      {unit === "repo" ? (
        <ul className={REPO_LIST_CLASS}>
          {storeGroups.slice(0, storeShown).map((group) => (
            <RepoCard
              key={group.key}
              repo={group.title}
              stars={group.stars}
              skills={group.skills.map((hit) => ({
                skill: hit.skill,
                matched: hit.matched,
              }))}
              hasQuery
              selected={opened?.answer === answer ? opened.key : null}
              onOpenSkill={openCard(answer)}
            />
          ))}
        </ul>
      ) : unit === "grid" ? (
        <ul className={SKILL_GRID_LIST_CLASS}>
          {storeHits.slice(0, storeShown).map((hit) => {
            const key = skillKey(hit.skill);
            return (
              <SkillGridCard
                key={key}
                skill={hit.skill}
                matched={hit.matched}
                selected={isOpen(answer, key)}
                onSelect={() => openRowOf(answer)(key)}
              />
            );
          })}
        </ul>
      ) : (
        <ul className={SKILL_ROW_LIST_CLASS}>
          {storeHits.slice(0, storeShown).map((hit, index) => (
            <SkillRow
              key={skillKey(hit.skill)}
              skill={hit.skill}
              matched={hit.matched}
              index={index}
              selected={isOpen(answer, skillKey(hit.skill))}
              onSelect={openRowOf(answer)}
            />
          ))}
        </ul>
      )}
      {!storeRevealed && <div ref={storeSentinel} aria-hidden="true" />}
    </>
  );

  // The asking list's own answer, in the unit's own shape.
  const ownAnswer = remote ? (
    storeLoading ? (
      skeleton
    ) : (
      storeAnswer("own")
    )
  ) : unit === "repo" ? (
    <ul className={REPO_LIST_CLASS}>
      {installedCards.map((card) => (
        <RepoCard
          key={card.repo || LOCAL_POOL_KEY}
          repo={card.repo}
          // The registry's figure, and only when the card's source
          // resolved to a store entry — an install the registry
          // cannot place has no figure to state.
          stars={
            card.items[0]?.skill.storeBacked
              ? card.items[0].skill.stars
              : undefined
          }
          skills={card.items}
          hasQuery
          selected={opened?.answer === "own" ? opened.key : null}
          onOpenSkill={openCard("own")}
          // The card rows stay control-less: one group switch on the
          // bar owns the card's skills, matching the list behind the
          // search.
          rowActions={false}
          footerAction={
            <RepoEnableSwitch
              names={card.items.map((row) => row.skill.name)}
              label={card.repo || t("common.thirdPartyInstall")}
            />
          }
        />
      ))}
    </ul>
  ) : unit === "grid" ? (
    <ul className={SKILL_GRID_LIST_CLASS}>
      {installed.map((row) => {
        const key = skillKey(row.skill);
        return (
          <SkillGridCard
            key={key}
            skill={row.skill}
            matched={row.matched}
            selected={isOpen("own", key)}
            muted={row.muted}
            extra={row.extra}
            action={row.action}
            onSelect={() => openRowOf("own")(key)}
          />
        );
      })}
    </ul>
  ) : (
    <ul className={SKILL_ROW_LIST_CLASS}>
      {installed.map((row, index) => (
        <SkillRow
          key={skillKey(row.skill)}
          skill={row.skill}
          matched={row.matched}
          index={index}
          // The same rows, and the same marks, as the installed list's own
          // answer: a row numbers its position in the order the reader picked
          // and the first three of that order wear the podium. A search narrows
          // the list, it does not re-rank it — the order here is the installed
          // list's order restricted to the matches, so the numbering and the
          // podium are the ones the list itself would print.
          selected={isOpen("own", skillKey(row.skill))}
          muted={row.muted}
          extra={row.extra}
          action={row.action}
          onSelect={openOwn}
        />
      ))}
    </ul>
  );

  // The live answer, in the same shape per unit. Its squares claim nothing
  // their source does not carry, and each opens skills.sh rather than a
  // detail panel this app cannot fill.
  const liveAnswer = liveSearching ? (
    skeleton
  ) : unit === "repo" ? (
    <ul className={REPO_LIST_CLASS}>
      {liveRepoGroups.map((group) => (
        <RepoCard
          key={group.key}
          repo={group.title}
          skills={group.skills.map((skill) => ({ skill }))}
          // A search's rows are matches: uncapped, like the
          // indexed cards under the same query — the card is the
          // whole live answer, not a summary of one.
          hasQuery
          // The card lists everything the endpoint answered, so
          // its bar has nothing to reveal: it stays a label. The
          // rows are the way out — each opens its skills.sh page
          // in the system browser.
          onOpenSkill={(key) => {
            const live = liveSkills.find((s) => skillKey(s) === key);
            if (live?.url) void openExternal(live.url);
          }}
        />
      ))}
    </ul>
  ) : unit === "grid" ? (
    <ul className={SKILL_GRID_LIST_CLASS}>
      {liveSkills.map((skill) => (
        <SkillGridCard
          key={skillKey(skill)}
          skill={skill}
          matched={liveMatched}
          onSelect={() => {
            if (skill.url) void openExternal(skill.url);
          }}
        />
      ))}
    </ul>
  ) : (
    <ul className={SKILL_ROW_LIST_CLASS}>
      {liveSkills.map((skill, index) => (
        <SkillRow
          key={skillKey(skill)}
          skill={skill}
          index={index}
          // An enumeration, not a ranking: the endpoint's
          // relevance order is no contest to medal.
          ranked={false}
          matched={liveMatched}
          onSelect={openLive}
        />
      ))}
    </ul>
  );

  // Which groups have something to show. A group that answered empty is absent;
  // one still answering is present, holding a skeleton.
  const ownVisible = ownBlock.skills.length > 0 || ownLoading;
  const storeVisible = !remote && (storeSkills.length > 0 || storeLoading);
  const liveVisible = liveSkills.length > 0 || liveSearching;
  // The empty state is the whole search's verdict: it speaks only once every
  // source has come back empty, and while any of them is still in flight it
  // speaks about the wait rather than about a result.
  const nothingFound = !ownVisible && !storeVisible && !liveVisible;
  const searching = storeLoading || liveSearching;
  // A source that answered empty but was not the *only* one to be asked leaves
  // one quiet line where its group would have been. A group that vanishes
  // silently is a scope change the reader has to notice on their own: on the
  // installed list, rows under no 「已安装」 header read as installs until the
  // reader happens to look up and find a different source's name. The line
  // costs one row of text and states the scope the answer is not.
  //
  // It yields to the whole-search empty state, which already speaks for this
  // source too — one fact does not need saying twice — and to the own group
  // still answering, whose skeleton is the statement for now.
  //
  // **The line is a centred notice, not a substitute group header.** It wears
  // the source's own glyph so it still names the scope it is speaking for, but
  // the icon and the sentence are centred *as one unit* in the answer column
  // rather than hung on the group header's icon and title columns. A lone
  // sentence stranded at the left edge of a 1216px band reads as a fragment that
  // drifted onto the page; centred, it reads as what it is — a notice about the
  // search, sitting between the query and the results it did come back with.
  //
  // This is a deliberate reversal of an earlier treatment that aligned the line
  // to the group header's two columns, and it does cost something real: a
  // centred line no longer shares an edge with any other row, card or header on
  // the page, so the eye has nothing to hang the rest of the answer on. What
  // keeps that from reading as a regression is that the *other* empty state is
  // the centred one (`Placeholder`, `h-full` in the viewport), so the page now
  // has one consistent idea of what a centred empty statement looks like, and
  // the two remain distinct by what they claim rather than by where they sit:
  // this one names a source, the full-page one names every source.
  //
  // `pl-6` is gone with the alignment it existed for, and it has to be: half of
  // that padding would sit inside the centring and push the whole unit 12px
  // right of true centre, which is the kind of half-measure that reads as
  // "almost centred" rather than as either.
  const ownNote =
    !nothingFound && !ownVisible ? (
      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <OwnIcon aria-hidden="true" className="size-4 shrink-0" />
        {t(remote ? "state.noIndexMatch" : "state.noInstalledMatch", { query })}
      </p>
    ) : null;

  return (
    <div className="flex flex-col gap-6">
      {nothingFound ? (
        searching ? (
          <Placeholder
            icon={Loader2}
            message={t("search.searching")}
            iconClassName="animate-spin"
          />
        ) : (
          <Placeholder
            message={t(
              remote ? "state.noMatch" : "state.noSourceMatch",
              { query },
            )}
          />
        )
      ) : (
        <>
          {/* 1. The asking list's own source — what this machine has, or what
              the registry's daily snapshot holds. A group when it has rows, the
              quiet scope line when it has none. */}
          {ownVisible ? (
            <CollapsibleSection
              icon={OwnIcon}
              title={t(remote ? "search.store" : "search.installed")}
              count={count(ownLoading, ownCount)}
            >
              {ownAnswer}
            </CollapsibleSection>
          ) : (
            ownNote
          )}

          {/* 2. The registry's index answering the installed list's question.
              Cheap and certain enough to simply be there. */}
          {storeVisible && (
            <CollapsibleSection
              className="border-t border-border/60 pt-6"
              icon={Store}
              title={t("search.store")}
              count={count(storeLoading, storeGroups.length)}
            >
              {storeLoading ? skeleton : storeAnswer("store")}
            </CollapsibleSection>
          )}

          {/* 3. skills.sh's live catalogue: the reach the daily snapshot has not
              published yet, asked for as the query settles rather than behind a
              press, and deduplicated against the registry's rows above. */}
          {liveVisible && (
            <CollapsibleSection
              className="border-t border-border/60 pt-6"
              icon={Globe}
              title={t("search.skillsSh")}
              count={count(liveSearching, unit === "repo" ? liveRepoGroups.length : liveSkills.length)}
            >
              {liveAnswer}
            </CollapsibleSection>
          )}
        </>
      )}

      {/* The drawer walks the answer the open skill came from, wearing that
          answer's surface — see the component note. A skill that leaves its
          answer closes the panel; an uninstall from the installed surface does
          the same. */}
      <SkillDetailDrawer
        skills={drawer.skills}
        selected={opened?.key ?? null}
        onSelect={(key) =>
          setOpened(key == null ? null : { answer: drawer.answer, key })
        }
        onRemoved={() => setOpened(null)}
        surface={drawer.surface}
      />
    </div>
  );
}
