import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { cn, formatCount } from "../../lib/utils";

/**
 * The skill unit's run and its fold, shared by the two skill lists that offer
 * one: the store's browse list and the installed list. Both hand over rows in
 * the same order (`byInstalls`) and both let a repository that ships several
 * close-ranked skills show its best and fold the rest away, so the ranking
 * reads as skills rather than as a repository's back catalogue.
 */

/**
 * The smallest run of consecutive skills from one repository worth folding
 * away. A shorter run is listed whole: hiding one or two rows behind a "+N"
 * line trades a plain row for a row plus a press, which costs more than it
 * saves. From four on, the fold earns its keep.
 */
export const FOLD_MIN_RUN = 4;

/**
 * What a run is made of: a skill, plus whatever the surface adds to it — the
 * store's search highlights, the installed list's enable switch. The builder
 * and the fold are generic over the row so both surfaces fold the same rows
 * they list.
 */
export interface RankedSkill {
  skill: { repo: string; name: string; downloads: number };
}

/** A run of consecutive skills from one repository. */
export interface SkillRunGroup<T> {
  /** The repository the run belongs to. */
  repo: string;
  /** The run head's rank (zero-based) in the flat list. */
  start: number;
  /** The run's skills, head first. */
  items: T[];
  /** The run's total installs, for the fold row's figure. */
  total: number;
}

/** The skill unit's order: most installed first, then by source and name. */
export function byInstalls<T extends RankedSkill>(a: T, b: T): number {
  return (
    b.skill.downloads - a.skill.downloads ||
    a.skill.repo.localeCompare(b.skill.repo) ||
    a.skill.name.localeCompare(b.skill.name)
  );
}

/**
 * Consecutive skills from one repository, gathered into runs so a repository
 * that ships several close-ranked skills can show its best and fold the rest
 * behind a single "+N more" row (see `SkillRun`, which decides whether a run is
 * long enough to be worth folding). Only *adjacent* skills form a run: a
 * repository whose skills the ranking separates stays listed where each falls.
 *
 * A skill with no source at all — the installed list's pool of installs no
 * ledger entry vouches for — is never gathered, however many of them sit next to
 * each other: a run *means* "these come from one repository", so folding the
 * pool would have to invent the one thing it does not have, and the page that
 * lists the pool whole enumerates it without a fold for the same reason.
 *
 * The list is read in the order it arrives — ranking it is the caller's (see
 * `byInstalls`), because each surface ranks its own rows.
 */
export function buildSkillRuns<T extends RankedSkill>(
  hits: T[],
): SkillRunGroup<T>[] {
  const runs: SkillRunGroup<T>[] = [];
  let index = 0;
  for (const hit of hits) {
    const last = runs.at(-1);
    const repo = hit.skill.repo;
    if (last && repo && last.repo === repo) {
      last.items.push(hit);
      last.total += hit.skill.downloads;
    } else {
      runs.push({
        repo,
        start: index,
        items: [hit],
        total: hit.skill.downloads,
      });
    }
    index += 1;
  }
  return runs;
}

/**
 * One repository's run in the skill unit: its best-ranked skill, and — when the
 * repository ships more than one — a quiet row that folds the rest away.
 *
 * A repository's skills are ranked together (they share a source, so they tend
 * to hold neighbouring installs), and a long run of them would push every other
 * repository down the page for what is, to the reader, one entry. So a run of
 * `FOLD_MIN_RUN` or more leads with its head and states the rest in one line —
 * "+N more from owner/repo", with the run's combined installs — unfolding them
 * in place on a press; a shorter run is listed whole, since hiding one or two
 * rows costs more than it saves. The fold is the reader's own toggle: the hidden
 * rows mount the moment it opens, and they stay part of the answer's detail walk
 * either way.
 *
 * The rows themselves are the caller's: `renderRow` draws one, told its rank in
 * the flat list — the fold row is the run's only presentation of its own. A
 * row's key belongs to the element `renderRow` returns, so the store's hits and
 * the installed list's records each keep their own identity.
 *
 * The fold row borrows the row's own rhythm — the ordinal and glyph columns
 * stand empty — so its text starts exactly where every skill name does.
 */
export function SkillRun<T extends RankedSkill>({
  group,
  open,
  renderRow,
  onToggle,
}: {
  group: SkillRunGroup<T>;
  /** Whether the run's hidden skills are unfolded. */
  open: boolean;
  /** Draws one run member at its rank in the flat list. */
  renderRow: (hit: T, index: number) => ReactNode;
  /** Folds or unfolds the run's hidden skills. */
  onToggle: () => void;
}) {
  // A run folds only once hiding actually saves rows: below the threshold it is
  // listed whole — head and all — so there is no fold row and nothing to press.
  const foldable = group.items.length >= FOLD_MIN_RUN;
  const hidden = foldable ? group.items.slice(1) : [];
  const shown = open || !foldable ? group.items : group.items.slice(0, 1);
  return (
    <>
      {shown.map((hit, offset) => renderRow(hit, group.start + offset))}
      {hidden.length > 0 && (
        <li className="-mt-2 flex flex-col">
          <button
            type="button"
            aria-expanded={open}
            onClick={onToggle}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-left text-[12px] text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            {/* The ordinal and glyph columns, left empty: the fold's text then
                lines up with every skill name above and below it. */}
            <span aria-hidden="true" className="w-6 shrink-0" />
            <span aria-hidden="true" className="size-7 shrink-0" />
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate">
                {open ? "收起" : `还有 ${hidden.length} 个来自 ${group.repo}`}
              </span>
              {/* The run's combined installs, and only when the run carries a
                  figure at all: a run whose skills are all outside the registry
                  has none to state, and a fabricated 共 0 would contradict the
                  rows above it, which show no figure either. */}
              {!open && group.total > 0 && (
                <span className="shrink-0 tabular-nums opacity-70">
                  共 {formatCount(group.total)}
                </span>
              )}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  open && "rotate-180",
                )}
              />
            </span>
          </button>
        </li>
      )}
    </>
  );
}
