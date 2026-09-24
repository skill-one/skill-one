import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Globe, HardDrive, Loader2, Store } from "lucide-react";

import { useRegistryGroups } from "../../hooks/use-registry-groups";
import { useSkillsShSearch } from "../../hooks/use-skills-sh-search";
import { openExternal } from "../../lib/open-external";
import {
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import type { ListUnit } from "../../lib/list-view";
import {
  REPO_CARD_SKELETON_CLASS,
  REPO_LIST_CLASS,
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
import { buildSkillRuns, SkillRun } from "./skill-run";
import { SkillRow } from "./skill-row";
import { RepoCard } from "./repo-card";

/**
 * The unified search answer, read wherever a list asks the shared query: one
 * answer in three sections, ordered from what the reader already has to what
 * is available —
 *
 * 1. **本地已安装** — the installs on disk that match, in the installed
 *    index's own relevance order (see `useInstalledSearchRows`). The section
 *    is a fact about this machine: its rows carry whatever the surface that
 *    rendered them injected (the enable switch, the migration badge), and its
 *    repository cards open the installed reading of a repository.
 * 2. **应用商店** — the registry's matches, in the worker's relevance order,
 *    shaped exactly as the store's own search answered before the sections
 *    existed.
 * 3. **skills.sh** — the live upstream answer, deduped against the store's,
 *    in the same shape per unit as the section above it.
 *
 * The unit switch decides what every section is made of, one shape per unit
 * across all three; empty sections do not render (an absent section reads
 * quieter than a zero), and when all three are empty the single empty state
 * speaks — holding a searching line while the live request is still in
 * flight, so "not found" is only ever said about the whole answer.
 *
 * The detail drawer walks the section the open skill was opened in, not the
 * three of them: prev/next means "the next one like this one", and the
 * surface (store CTA against installed switch) follows the section too. The
 * same skill may legitimately sit in two sections — the install and the store
 * entry behind it are two facts, not a duplicate — so the selection is
 * addressed by section as well as by identity.
 *
 * The two search fetches (store, live) live here rather than in the pages:
 * the component is rendered exactly while a search is live, so the queries
 * enable themselves, and both pages answer one question through one piece of
 * code. Only the installed rows arrive as props — they are render-ready (the
 * page injects the surface's own action), and the page alone knows the ledger
 * and the link suggestions behind them.
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

/** Where an installed section's repository card leads. */
const INSTALLED_REPO_PATH = "/my-skills/repo/";
/** Where the pool card leads: skills no recorded source vouches for. */
const LOCAL_POOL_PATH = "/my-skills/local";
/** React-key identity of the pool card. */
const LOCAL_POOL_KEY = "local";

export function SearchResults({
  unit,
  query,
  installed,
  installedSurface = false,
}: {
  /** The unit every section is read in. */
  unit: ListUnit;
  /** The settled query; the live rows' highlight terms derive from it. */
  query: string;
  /** The installed answer, render-ready; empty hides the section. */
  installed: SearchRow[];
  /**
   * Whether the answer is read from the my-skills surface. There, installed
   * repository cards carry no per-row control: one group switch on the bar
   * manages the card's skills, the same as the list behind the search. The
   * store leaves installed cards their hover-revealed install buttons.
   */
  installedSurface?: boolean;
}) {
  const { t } = useTranslation();
  // The store's answer: matched groups in the worker's relevance order. The
  // component only ever renders under a live search, so the query enables
  // itself.
  const groupsQuery = useRegistryGroups(query, true);
  const storeLoading = groupsQuery.isLoading;
  // Memoized so the derivations below keep stable inputs across renders.
  const storeGroups = useMemo(
    () => groupsQuery.data?.groups ?? [],
    [groupsQuery],
  );

  // The live skills.sh answer for the same query, in flight while it fetches —
  // the empty state below waits for it before saying "not found".
  const { data: liveData, isFetching: liveSearching } =
    useSkillsShSearch(query);

  const storeHits = useMemo(
    () => storeGroups.flatMap((group) => group.skills),
    [storeGroups],
  );
  const storeSkills = useMemo(
    () => storeHits.map((hit) => hit.skill),
    [storeHits],
  );

  // The live answer: what the store's does not already cover. Identity is the
  // whole comparison — the same `repo/name` pair both sides key a skill by.
  // Duplicates against the installed section are legitimate: the install and
  // the upstream entry are two facts, and the sections say which is which.
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

  // Which folds the reader has opened, by section and run head's key: a run's
  // head key belongs to the section that produced it, and the same repository
  // may run in two sections at once.
  const [openRuns, setOpenRuns] = useState<Record<string, boolean>>({});
  const toggleRun = (key: string) =>
    setOpenRuns((prev) => ({ ...prev, [key]: !prev[key] }));

  // The open skill, addressed by the section it was opened in plus its
  // identity — see the component note above.
  const [selected, setSelected] = useState<{
    section: "installed" | "store";
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

  // The installed runs, in the order the installed index answered.
  const installedRuns = useMemo(() => buildSkillRuns(installed), [installed]);
  // The store's runs, in the relevance order the worker answered.
  const storeRuns = useMemo(() => buildSkillRuns(storeHits), [storeHits]);

  // The drawer's per-section walk: each section is its own prev/next domain,
  // with the surface its rows were opened from.
  const drawerSections = useMemo(() => {
    const sections: Array<{
      surface: "installed" | "store";
      skills: SkillView[];
    }> = [];
    if (installed.length > 0) {
      sections.push({
        surface: "installed",
        skills: installed.map((row) => row.skill),
      });
    }
    if (storeSkills.length > 0) {
      sections.push({ surface: "store", skills: storeSkills });
    }
    return sections;
  }, [installed, storeSkills]);
  const activeSection =
    selected == null
      ? null
      : (drawerSections.find(
          (section) =>
            section.surface === selected.section &&
            section.skills.some((skill) => skillKey(skill) === selected.key),
        ) ?? null);

  // Loading, empty, searching. The sections render progressively — the
  // installed answer is memory and lands first, the store's and the live one
  // arrive when they arrive — so an answer is never held hostage by its
  // slowest piece. Only when everything came back empty does the page speak:
  // a searching line while any request is still in flight (a "not found"
  // before that would describe half the answer), the empty state once it can
  // be said about the whole.
  const empty =
    installed.length === 0 &&
    storeSkills.length === 0 &&
    liveSkills.length === 0;
  const searching = storeLoading || liveSearching;

  return (
    <div className="flex flex-col gap-8 [&>section+section]:border-t [&>section+section]:border-border/60 [&>section+section]:pt-6">
      {empty ? (
        searching ? (
          <Placeholder
            icon={Loader2}
            message={t("search.searchingLive")}
            iconClassName="animate-spin"
          />
        ) : (
          <Placeholder message={t("state.noMatch", { query })} />
        )
      ) : (
        <>
          {/* 1 — 本地已安装: what this machine already has. */}
          {installed.length > 0 && (
            <CollapsibleSection
              icon={HardDrive}
              title={t("search.installed")}
              count={
                unit === "repo"
                  ? t("state.repoCount", { count: installedCards.length })
                  : t("state.skillCount", { count: installed.length })
              }
            >
              {unit === "skill" ? (
                <ul className={SKILL_ROW_LIST_CLASS}>
                  {installedRuns.map((group) => {
                    const headKey = `installed:${skillKey(group.items[0].skill)}`;
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
                              // The installed list is not a leaderboard: its
                              // figures come from the store, and the installs
                              // it cannot place would leave the podium on
                              // alphabetical order. The numbers merely count.
                              ranked={false}
                              selected={
                                selected?.section === "installed" &&
                                selected.key === key
                              }
                              muted={row.muted}
                              extra={row.extra}
                              action={row.action}
                              onSelect={() =>
                                setSelected({ section: "installed", key })
                              }
                            />
                          );
                        }}
                        onToggle={() => toggleRun(headKey)}
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
                      selected={
                        selected?.section === "installed" ? selected.key : null
                      }
                      onOpenSkill={(key) =>
                        setSelected({ section: "installed", key })
                      }
                      // A repository card's bar opens the repository as the
                      // installed list reads it — the installs on disk — the
                      // pool's opens the pool page, having no repository.
                      href={
                        card.repo
                          ? `${INSTALLED_REPO_PATH}${card.repo}`
                          : LOCAL_POOL_PATH
                      }
                      // On the my-skills surface the card rows stay
                      // control-less: one group switch on the bar owns the
                      // card's skills, matching the list behind the search.
                      rowActions={!installedSurface}
                      footerAction={
                        installedSurface ? (
                          <RepoEnableSwitch
                            names={card.items.map((row) => row.skill.name)}
                            label={card.repo || t("common.localInstall")}
                          />
                        ) : undefined
                      }
                    />
                  ))}
                </ul>
              )}
            </CollapsibleSection>
          )}

          {/* 2 — 应用商店: what the registry's index carries. While its answer
              is in flight the section holds its place with a skeleton, so the
              three-section shape is visible from the first paint and the
              answer lands into it, not onto it. */}
          {(storeSkills.length > 0 || storeLoading) && (
            <CollapsibleSection
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
              ) : unit === "skill" ? (
                <ul className={SKILL_ROW_LIST_CLASS}>
                  {storeRuns.map((group) => {
                    const headKey = `store:${skillKey(group.items[0].skill)}`;
                    return (
                      <SkillRun
                        key={headKey}
                        group={group}
                        open={!!openRuns[headKey]}
                        renderRow={(hit, index) => {
                          const key = skillKey(hit.skill);
                          return (
                            <SkillRow
                              key={key}
                              skill={hit.skill}
                              matched={hit.matched}
                              index={index}
                              selected={
                                selected?.section === "store" &&
                                selected.key === key
                              }
                              onSelect={() =>
                                setSelected({ section: "store", key })
                              }
                            />
                          );
                        }}
                        onToggle={() => toggleRun(headKey)}
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
                      selected={
                        selected?.section === "store" ? selected.key : null
                      }
                      onOpenSkill={(key) =>
                        setSelected({ section: "store", key })
                      }
                    />
                  ))}
                </ul>
              )}
            </CollapsibleSection>
          )}

          {/* 3 — skills.sh: what the live endpoint adds, minus what the store
              section already covers. Same shape per unit as the sections above
              it; its rows claim nothing their source does not carry. */}
          {liveSkills.length > 0 && (
            <CollapsibleSection
              icon={Globe}
              title={t("search.skillsSh")}
              count={
                unit === "repo"
                  ? t("state.repoCount", { count: liveRepoGroups.length })
                  : t("state.skillCount", { count: liveSkills.length })
              }
            >
              {unit === "skill" ? (
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
                      // its bar has nowhere further to go: it stays a label.
                      // The rows are the way out — each opens its skills.sh
                      // page in the system browser.
                      href={null}
                      onOpenSkill={(key) => {
                        const live = liveSkills.find(
                          (s) => skillKey(s) === key,
                        );
                        if (live?.url) void openExternal(live.url);
                      }}
                    />
                  ))}
                </ul>
              )}
            </CollapsibleSection>
          )}
        </>
      )}

      {/* The drawer walks the section the open skill came from — see the
          component note. A skill that leaves its section closes the panel;
          an uninstall from the installed surface does the same. */}
      <SkillDetailDrawer
        skills={activeSection?.skills ?? []}
        selected={activeSection && selected ? selected.key : null}
        onSelect={(key) =>
          setSelected(
            key == null || !activeSection
              ? null
              : { section: activeSection.surface, key },
          )
        }
        onRemoved={() => setSelected(null)}
        surface={activeSection?.surface ?? "store"}
      />
    </div>
  );
}
