import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Globe, Loader2, Store } from "lucide-react";

import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useSkillsShSearch } from "../../hooks/use-skills-sh-search";
import { openExternal } from "../../lib/open-external";
import { skillKey, type SkillView } from "../../lib/skill-view";
import type { Destination, ListUnit } from "../../lib/list-view";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import type { SkillMatched } from "../../components/highlighted-text";
import { CollapsibleSection } from "../../components/collapsible-section";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { RepoEnableSwitch } from "../../components/repo-enable-switch";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Placeholder } from "../../components/placeholder";
import { SkeletonList } from "../../components/skeleton-list";
import { Button } from "../../components/ui/button";
import { buildLiveRepoGroups } from "./live-groups";
import { SkillRow } from "./skill-row";
import { RepoCard } from "./repo-card";

/**
 * The search answer, read wherever a list asks the shared query. Every surface
 * answers in the same three layers, and which layer each source falls into is a
 * fact about that source rather than about the list — which is what makes the
 * two surfaces read as one behaviour instead of two:
 *
 * 1. **The list's own answer**, laid out plainly, with no header: this list *is*
 *    the source, so its rows say where they came from by being on screen, and a
 *    header would only name what the reader is already looking at. On the store
 *    that is the registry's index; on the installed list it is what this
 *    machine has. Empty, the page says so in its own words — the store says
 *    nothing matched, the installed list says nothing it has matched — because
 *    the layers below may still have something, and say so themselves.
 * 2. **A cheap supplement**, for a source already in memory: the store's index
 *    answering an installed search. Titled section, count, open by default
 *    (`CollapsibleSection`) — it costs nothing to have and usually has something.
 * 3. **A dear supplement**, for the one source that is a cross-network request
 *    that may come back empty (skills.sh, on both surfaces): folded behind a
 *    press (`Reveal`), fetched only once asked, and still there under the empty
 *    state — which is exactly where a reader who found nothing goes next.
 *
 * The layers share one shape per unit, so a skill reads the same wherever it is
 * found, and an absent supplement renders nothing at all (a missing section is
 * quieter than a zero). The store's own live supplement is deduplicated against
 * the registry's, since two indexes carrying one skill is one row, not two.
 *
 * The detail drawer walks the answer a row was opened in, wearing that answer's
 * surface — the installed list's own rows carry the enable switch, the store's
 * rows the install CTA — so the open skill is addressed by answer plus identity.
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
 * One supplement too dear to fetch unasked: a full-width dashed outline button
 * that states what the press will do, and the answer it fetched below.
 *
 * It is drawn as a button rather than a section header because that is exactly
 * what it is — a press, not a heading — and the dashed outline is the shape the
 * design system already uses for "not filled in yet", which is what this answer
 * is until the reader asks for it. The store's cheap supplement needs no such
 * ceremony (see `CollapsibleSection`); this shell is for the one that waits.
 */
function Reveal({
  open,
  onOpenChange,
  label,
  children,
}: {
  /** Whether the answer is on screen. */
  open: boolean;
  /** The fold, lifted so the label and the chevron can follow it. */
  onOpenChange: (open: boolean) => void;
  /** What the control says — the action, not the answer's name. */
  label: string;
  /** The answer, once asked for. */
  children: ReactNode;
}) {
  return (
    <Collapsible className="group/reveal" open={open} onOpenChange={onOpenChange}>
      <Button
        variant="outline"
        size="lg"
        render={<CollapsibleTrigger />}
        className="w-full justify-center gap-2 border-dashed"
      >
        <Globe aria-hidden="true" className="size-4 text-muted-foreground" />
        {label}
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform duration-150 group-data-[open]/reveal:rotate-180"
        />
      </Button>
      <CollapsibleContent className="pt-4" data-slot="reveal-content">
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}

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
   * Which list is searching — and so which sources answer, and in which
   * surface the rows it opens read (see the component note).
   */
  destination: Destination;
  /**
   * The installed answer, render-ready. Only the installed list hands one over:
   * the store's answer holds no section for it, and an absent prop says so.
   */
  installed?: SearchRow[];
}) {
  const { t } = useTranslation();
  // Which sources answer is the searching list's own answer: the store reads
  // the registry, the installed list reads this machine's own records, and both
  // read the other as a supplement below their own.
  const remote = destination === "store";
  // The registry's index is cheap and certain — it is already in the worker's
  // memory — so it is asked for the moment a search is live on either surface.
  const groupsQuery = useRegistryGroups(query);
  const storeLoading = groupsQuery.isLoading;
  // Memoized so the derivations below keep stable inputs across renders.
  const storeGroups = useMemo(
    () => groupsQuery.data?.groups ?? [],
    [groupsQuery],
  );

  // The live skills.sh answer is the one source too dear and too uncertain to
  // fetch unasked, so it waits for a press on its reveal — and asking is
  // one-way: folding the answer away keeps it cached, so reopening it costs no
  // round trip. The fold itself is held here rather than left to the widget, so
  // the label can state what the press will do.
  const [liveAsked, setLiveAsked] = useState(false);
  const [liveRevealed, setLiveRevealed] = useState(false);
  const { data: liveData, isFetching: liveSearching } = useSkillsShSearch(
    query,
    liveAsked,
  );

  const storeHits = useMemo(
    () => storeGroups.flatMap((group) => group.skills),
    [storeGroups],
  );
  const storeSkills = useMemo(
    () => storeHits.map((hit) => hit.skill),
    [storeHits],
  );

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
  // for the live rows' highlight.
  const liveTerms = useMemo(() => query.split(/\s+/).filter(Boolean), [query]);

  // The open skill, addressed by the answer it was opened in plus its identity:
  // the installed list's reveal puts the store's own rows under its own rows
  // (see the component note), and those two answers wear different surfaces.
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
  // store's list; two on the installed list's, once its reveal is open. The
  // live section is in no walk: its rows open skills.sh.
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

  // Loading, empty, searching — all three about the list's *own* answer, which
  // is the only one on screen by default. It renders progressively (a local
  // answer is memory and lands first; the store's lands when it lands), and
  // only when it came back empty does the page speak: a searching line while its
  // request is still in flight, the empty state once it can be said. The
  // supplements below keep their own verdicts — an absent section is quieter
  // than a zero — so "not found" here describes this list alone, which is why
  // the installed list says so in its own words: the store's answer may well be
  // waiting right below.
  const empty = ownBlock.skills.length === 0;
  const searching = storeLoading || liveSearching;

  /** Which answer a row belongs to: the list's own, or the store's reveal. */
  type Answer = "own" | "store";
  // Rows address the selection the way they are addressed — which answer they
  // belong to, plus their own key — so neither has to restate the other's.
  const isOpen = (answer: Answer, key: string) =>
    opened?.answer === answer && opened.key === key;
  const openRow = (answer: Answer, key: string) => () =>
    setOpened({ answer, key });
  const openCard =
    (answer: Answer) =>
    (key: string | null) =>
      setOpened(key == null ? null : { answer, key });

  // The store's grouped answer in the unit's own shape — the store list's own
  // answer, and the installed list's reveal, read from the same place.
  const storeAnswer = (answer: Answer) =>
    unit === "skill" ? (
      <ul className={SKILL_ROW_LIST_CLASS}>
        {storeHits.map((hit, index) => {
          const key = skillKey(hit.skill);
          return (
            <SkillRow
              key={key}
              skill={hit.skill}
              matched={hit.matched}
              index={index}
              selected={isOpen(answer, key)}
              onSelect={openRow(answer, key)}
            />
          );
        })}
      </ul>
    ) : (
      <ul className={REPO_LIST_CLASS}>
        {storeGroups.map((group) => (
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
    );

  // The list's own answer, laid out plainly — this list *is* the source, so its
  // rows say where they came from by being this list. A header would only
  // repeat what the reader is already looking at. While the store's index is
  // still answering, the slot holds a skeleton of the unit's own shape, so the
  // answer lands into the layout rather than onto it.
  const ownAnswer = remote ? (
    storeLoading ? (
      <SkeletonList
        rows={3}
        listClassName={
          unit === "skill" ? SKILL_ROW_LIST_CLASS : REPO_LIST_CLASS
        }
        itemClassName={
          unit === "skill" ? SKILL_ROW_SKELETON_CLASS : REPO_CARD_SKELETON_CLASS
        }
      />
    ) : (
      storeAnswer("own")
    )
  ) : unit === "skill" ? (
    <ul className={SKILL_ROW_LIST_CLASS}>
      {installed.map((row, index) => {
        const key = skillKey(row.skill);
        return (
          <SkillRow
            key={key}
            skill={row.skill}
            matched={row.matched}
            index={index}
            // The installed list is not a leaderboard: its
            // figures come from the store, and the installs
            // it cannot place would leave the podium on
            // alphabetical order. The numbers merely count.
            ranked={false}
            selected={isOpen("own", key)}
            muted={row.muted}
            extra={row.extra}
            action={row.action}
            onSelect={openRow("own", key)}
          />
        );
      })}
    </ul>
  ) : (
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
              label={card.repo || t("common.localInstall")}
            />
          }
        />
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-8">
      {empty ? (
        searching ? (
          <Placeholder
            icon={Loader2}
            message={t("search.searchingLive")}
            iconClassName="animate-spin"
          />
        ) : (
          <Placeholder
            message={t(remote ? "state.noMatch" : "state.noInstalledMatch", {
              query,
            })}
          />
        )
      ) : (
        ownAnswer
      )}

      {/* The registry's index as a supplement — the installed list's second
          answer, below its own. Cheap and certain enough to simply be there:
          a titled section with a count, open by default, the same shell the
          store's own skills.sh section uses. Hidden while it has nothing to say
          (an absent section reads quieter than a zero). */}
      {!remote && (storeSkills.length > 0 || storeLoading) && (
        <CollapsibleSection
          className="border-t border-border/60 pt-6"
          icon={Store}
          title={t("search.store")}
          count={
            storeLoading
              ? t("search.searching")
              : unit === "repo"
                ? t("state.repoCount", { count: storeGroups.length })
                : t("state.skillCount", { count: storeSkills.length })
          }
        >
          {storeLoading ? (
            <SkeletonList
              rows={3}
              listClassName={
                unit === "skill" ? SKILL_ROW_LIST_CLASS : REPO_LIST_CLASS
              }
              itemClassName={
                unit === "skill"
                  ? SKILL_ROW_SKELETON_CLASS
                  : REPO_CARD_SKELETON_CLASS
              }
            />
          ) : (
            storeAnswer("store")
          )}
        </CollapsibleSection>
      )}

      {/* skills.sh — the same on both surfaces, and the only source either of
          them waits for: a cross-network request that may well come back
          nothing, asked for by a press and not before. The label says what the
          press will do; what it brings is the same shape per unit as the
          answers above it, and its rows claim nothing their source does not
          carry. */}
      <Reveal
        open={liveRevealed}
        onOpenChange={(next) => {
          setLiveRevealed(next);
          if (next) setLiveAsked(true);
        }}
        label={t(
          liveRevealed ? "search.liveResultsHide" : "search.liveResults",
        )}
      >
        {liveSearching ? (
          <SkeletonList
            rows={3}
            listClassName={
              unit === "skill" ? SKILL_ROW_LIST_CLASS : REPO_LIST_CLASS
            }
            itemClassName={
              unit === "skill"
                ? SKILL_ROW_SKELETON_CLASS
                : REPO_CARD_SKELETON_CLASS
            }
          />
        ) : liveSkills.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">
            {t("state.noMatch", { query })}
          </p>
        ) : unit === "skill" ? (
          <ul className={SKILL_ROW_LIST_CLASS}>
            {liveSkills.map((skill, index) => (
              <SkillRow
                key={skillKey(skill)}
                skill={skill}
                index={index}
                // An enumeration, not a ranking: the endpoint's
                // relevance order is no contest to medal.
                ranked={false}
                matched={{ name: liveTerms }}
                onSelect={() => {
                  if (skill.url) void openExternal(skill.url);
                }}
              />
            ))}
          </ul>
        ) : (
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
        )}
      </Reveal>

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
