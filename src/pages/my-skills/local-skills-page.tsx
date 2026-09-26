import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes } from "lucide-react";

import { useDebouncedValue } from "../../hooks/use-debounced-value";
import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useListQuery } from "../../hooks/use-list-view";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { FoldRule } from "../../components/fold-rule";
import {
  installedSkillView,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
import { buildSearchIndex } from "../../lib/search-index";
import {
  SKILL_ROW_LIST_CLASS,
  SKILL_ROW_SKELETON_CLASS,
} from "../../lib/skill-list-layout";
import { errorMessage } from "../../lib/utils";
import { compareByInstalledTime } from "../../lib/time-groups";
import { DrillDownHead } from "../../components/drill-down-head";
import { RepoEnableSwitch } from "../../components/repo-enable-switch";
import { SkillDetailDrawer } from "../../components/skill-detail/skill-detail-drawer";
import { Placeholder } from "../../components/placeholder";
import { SkeletonList } from "../../components/skeleton-list";
import { SkillEnableSwitch } from "../../components/skill-enable-switch";
import { LinkSuggestionBadge } from "./link-suggestion-badge";
import type { LinkCandidate } from "../../lib/link-suggestions";
import { SkillRow, type SkillMatched } from "../explore/skill-row";

/** How many rows mount with the page, and how many more each scroll reveals. */
const INITIAL_ROWS = 12;
const ROW_CHUNK = 12;

/** Placeholder rows while the on-disk list is first read. */
const SKELETON_ROWS = 8;

/** One unlinked install, precomputed where the list is built. */
interface Row {
  view: SkillView;
  enabled: boolean;
  suggestion?: LinkCandidate[];
  /** Search-hit highlights; set only in the matches section. */
  matched?: SkillMatched;
}

/**
 * The installed list's local pool, listed whole — the page the 本地安装 card's
 * bar opens.
 *
 * The installed list folds every skill no recorded source vouches for into one
 * card and caps it like any repository's; this is what that card's door opens,
 * exactly as a repository card's door opens the repository's own page. It is
 * the same list — the pool's rows, uncapped — so the two surfaces cannot
 * disagree about what the pool holds, in what the rows read in either: newest
 * install first (ties by name), the card's own order.
 *
 * The rows read like a repository page's: an enumeration (no podium — the pool
 * carries no order to win), each row carrying the enable switch and, on an
 * install the registry has a plausible namesake for, the migration badge that
 * records where it came from. The source is not repeated per row: the page's own
 * head already states it.
 *
 * A query the reader brought with them (the one search box both lists share,
 * see `lib/list-view`) the page answers the way the card under that query did:
 * matches first, in the index's relevance order — the same order the pool card
 * reads its rows in while a search is live — and the pool rows the query ruled
 * out behind one fold. A query nothing answers widens back to the whole pool.
 */
export function LocalSkillsPage() {
  const { t } = useTranslation();
  const { data: installed, isLoading, isError, error } = useInstalledSkills();

  // The ledger is what tells a placed install from one nothing vouches for: a
  // source-less record is one the ledger holds no entry for.
  const { data: provenanceState } = useSkillProvenance();
  const linked = provenanceState?.linked;
  const suggestions = provenanceState?.suggestions;

  const list = useMemo(() => installed ?? [], [installed]);

  // No store entry is looked up: a source-less record has no source to resolve
  // one for, so the views carry no classification and no figure — which is
  // exactly what the pool's card rows show. The rows read newest install first,
  // the order the pool card lists them in (see `my-skills-page`), so opening
  // the card cannot reshuffle what it showed; a record with no birth time
  // trails (ties by name, as on the card).
  const rows = useMemo<Row[]>(
    () =>
      list
        .filter((skill) => !linked?.[skill.name])
        .map((skill) => ({
          view: installedSkillView(skill, linked),
          enabled: skill.enabled,
          suggestion: suggestions?.[skill.name],
        }))
        .toSorted(
          compareByInstalledTime(
            (row) => row.view.installedAt,
            (a, b) => a.view.name.localeCompare(b.view.name),
          ),
        ),
    [list, linked, suggestions],
  );

  // The search the reader came here with. The search box is one control shared
  // by both lists (see `lib/list-view`), so a query that opened the pool card
  // is still live on the page the card opens — and that page answers it the
  // same way the card did rather than silently ignoring it.
  const search = useListQuery();
  const query = useDebouncedValue(search).trim();
  const searching = query.length > 0;

  // The pool's own answer to that query, over the same rows in the same order
  // the page reads them (the pool is short, so the index is cheap to build and
  // rebuild — the same rule the installed list's index follows).
  const poolSearch = useMemo(
    () => buildSearchIndex(rows.map((row) => row.view)),
    [rows],
  );
  const hits = useMemo(
    () => (searching ? poolSearch(query) : null),
    [searching, poolSearch, query],
  );

  // The matches, in the answer's own order (relevance) — the order the pool
  // card reads its rows in while the same query is live. A query nothing
  // answers widens to the ordinary page: an empty matches section would read
  // as a dead end.
  const matched = useMemo<Row[] | null>(() => {
    if (!hits) return null;
    if (hits.length === 0) return null;
    const byName = new Map(rows.map((row) => [row.view.name, row]));
    return hits.flatMap((hit) => {
      const row = byName.get(hit.doc.name);
      return row ? [{ ...row, matched: hit.matched }] : [];
    });
  }, [hits, rows]);

  // The pool rows the query ruled out, folded behind the dividing rule — the
  // same one fold the repository page draws under its matches.
  const rest = useMemo<Row[] | null>(() => {
    if (!matched) return null;
    const names = new Set(matched.map((row) => row.view.name));
    const ruled = rows.filter((row) => !names.has(row.view.name));
    return ruled.length > 0 ? ruled : null;
  }, [matched, rows]);

  // The fold is the page's own state, not the shared list view's: it folds
  // this pool under this query, nothing wider. It stands down when the
  // question changes — a fold opened for one answer is not a place the reader
  // stands under the next.
  const [restOpen, setRestOpen] = useState(false);
  const lastQuestion = useRef(query);
  useEffect(() => {
    if (lastQuestion.current === query) return;
    lastQuestion.current = query;
    setRestOpen(false);
  }, [query]);

  // What the page lists: the matches when a search led here, the pool whole
  // when it did not — then, unfolded, what the search ruled out.
  const first = matched ?? rows;
  const restSection = restOpen ? rest : null;

  // One reveal paces the page across both sections: folded, the count runs
  // through the first section alone; a fold open runs it on into that
  // section, numbering continuing rather than restarting.
  const { count, sentinelRef, done } = useProgressiveReveal({
    total: first.length + (restSection?.length ?? 0),
    initial: INITIAL_ROWS,
    step: ROW_CHUNK,
    resetKey: `${query}\u0000${restSection ? "open" : "folded"}`,
  });
  const firstShown = first.slice(0, count);
  const restShown = restSection
    ? restSection.slice(0, Math.max(0, count - first.length))
    : [];

  // The drawer walks the same list the page renders, in the same order.
  const allViews = useMemo(
    () => [...first, ...(restSection ?? [])].map((row) => row.view),
    [first, restSection],
  );

  const [selected, setSelected] = useState<string | null>(null);

  const renderRow = (row: Row, index: number) => (
    <SkillRow
      key={row.view.name}
      skill={row.view}
      matched={row.matched}
      index={index}
      // The pool carries no order to win, so its numbers merely count the
      // list.
      ranked={false}
      // The head states the source once; every row here has the same one.
      showSource={false}
      muted={!row.enabled}
      selected={selected === skillKey(row.view)}
      extra={
        row.suggestion?.length ? (
          <LinkSuggestionBadge
            name={row.view.name}
            localDescription={row.view.description}
            candidates={row.suggestion}
            variant="icon"
          />
        ) : undefined
      }
      action={<SkillEnableSwitch skill={row.view} />}
      onSelect={() => setSelected(skillKey(row.view))}
    />
  );

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The page's head: the way back to the installed list, and the pool's
          identity in the same voice as a repository page's head — minus the
          repository, which is the whole point of this page, and minus the face
          that would have to stand for one (see `DrillDownHead`). It keeps the
          card bar's one action: the switch that enables or disables the whole
          pool in one press, the same group switch a repository page carries —
          per-skill switches stay on the rows below. The figure stays the
          pool's whole count: each fold states its own. */}
      <DrillDownHead
        back="/my-skills"
        title={t("common.localInstall")}
        meta={t("state.skillCount", { count: rows.length })}
        action={
          rows.length > 0 ? (
            <RepoEnableSwitch
              names={rows.map((row) => row.view.name)}
              label={t("common.localInstall")}
            />
          ) : undefined
        }
      />

      <div className="min-h-0 flex-1 -mx-3 overflow-y-auto px-3 pb-5">
        {isError ? (
          <Placeholder
            icon={Boxes}
            message={t("state.loadFailed", {
              message: errorMessage(error),
            })}
          />
        ) : isLoading ? (
          <SkeletonList
            rows={SKELETON_ROWS}
            listClassName={SKILL_ROW_LIST_CLASS}
            itemClassName={SKILL_ROW_SKELETON_CLASS}
          />
        ) : rows.length === 0 ? (
          <Placeholder icon={Boxes} message={t("state.noLocal")} />
        ) : (
          <>
            {/* The first section: the matches when a search led here, the
                pool whole when it did not. These rows never move or change
                voice when the fold below opens — the whole point of folding
                rather than swapping. */}
            {firstShown.length > 0 && (
              <ul className={SKILL_ROW_LIST_CLASS}>
                {firstShown.map((row, index) => renderRow(row, index))}
              </ul>
            )}

            {/* The search fold: the pool rows the query ruled out, drawn as a
                dividing rule across the list — the matches end where the rule
                begins, the rest begins where it ends. */}
            {rest != null && (
              <div className={firstShown.length > 0 ? "py-4" : "pt-1"}>
                <FoldRule
                  controls="pool-other-skills"
                  open={restOpen}
                  closedLabel={t("pool.showOtherInstalled", {
                    count: rest.length,
                  })}
                  openLabel={t("pool.collapseOtherInstalled", {
                    count: rest.length,
                  })}
                  onToggle={() => setRestOpen((open) => !open)}
                />
              </div>
            )}
            {restShown.length > 0 && (
              <ul id="pool-other-skills" className={SKILL_ROW_LIST_CLASS}>
                {restShown.map((row, i) => renderRow(row, first.length + i))}
              </ul>
            )}

            {/* The sentinel ends the rendered run: while it is on screen the
                observer extends the run, so scrolling down keeps revealing rows
                until the list is fully mounted. */}
            {!done && <div ref={sentinelRef} aria-hidden="true" />}
          </>
        )}
      </div>

      {/* The same right-side detail drawer the installed list uses, told which
          list owns it: the enable switch in place of the store's install CTA,
          and no registry-only figures. */}
      <SkillDetailDrawer
        skills={allViews}
        selected={selected}
        onSelect={setSelected}
        onRemoved={() => setSelected(null)}
        surface="installed"
      />
    </div>
  );
}
