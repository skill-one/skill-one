import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Boxes } from "lucide-react";

import { useInstalledSkills } from "../../hooks/use-installed-skills";
import { useSkillProvenance } from "../../hooks/use-skill-provenance";
import { useProgressiveReveal } from "../../hooks/use-progressive-reveal";
import {
  installedSkillView,
  skillKey,
  type SkillView,
} from "../../lib/skill-view";
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
import { SkillRow } from "../explore/skill-row";

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
}

/**
 * The installed list's local pool, listed whole — the page the 本地安装 card's
 * bar opens.
 *
 * The installed list folds every skill no recorded source vouches for into one
 * card and caps it like any repository's; this is what that card's door opens,
 * exactly as a repository card's door opens the repository's own page. It is
 * the same list — the pool's rows, uncapped — so the two surfaces cannot
 * disagree about what the pool holds.
 *
 * The rows read like a repository page's: an enumeration (no podium — the pool
 * carries no order to win), each row carrying the enable switch and, on an
 * install the registry has a plausible namesake for, the migration badge that
 * records where it came from. The source is not repeated per row: the page's own
 * head already states it.
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

  const [selected, setSelected] = useState<string | null>(null);
  const { count, sentinelRef, done } = useProgressiveReveal({
    total: rows.length,
    initial: INITIAL_ROWS,
    step: ROW_CHUNK,
  });
  const shown = rows.slice(0, count);

  // The drawer walks the same list the page renders, in the same order.
  const allViews = useMemo(() => rows.map((row) => row.view), [rows]);

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col px-8 pt-3 pb-5">
      {/* The page's head: the way back to the installed list, and the pool's
          identity in the same voice as a repository page's head — minus the
          repository, which is the whole point of this page, and minus the face
          that would have to stand for one (see `DrillDownHead`). It keeps the
          card bar's one action: the switch that enables or disables the whole
          pool in one press, the same group switch a repository page carries —
          per-skill switches stay on the rows below. */}
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
            <ul className={SKILL_ROW_LIST_CLASS}>
              {shown.map((row, index) => (
                <SkillRow
                  key={row.view.name}
                  skill={row.view}
                  index={index}
                  // The pool carries no order to win, so its numbers merely
                  // count the list.
                  ranked={false}
                  // The head states the source once; every row here has the
                  // same one.
                  showSource={false}
                  muted={!row.enabled}
                  selected={selected === skillKey(row.view)}
                  extra={
                    row.suggestion?.length ? (
                      <LinkSuggestionBadge
                        name={row.view.name}
                        candidates={row.suggestion}
                      />
                    ) : undefined
                  }
                  action={<SkillEnableSwitch skill={row.view} />}
                  onSelect={() => setSelected(skillKey(row.view))}
                />
              ))}
            </ul>
            {/* The sentinel ends the rendered run: while it is on screen the
                observer extends the run, so scrolling down keeps revealing rows
                until the pool is fully mounted. */}
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
