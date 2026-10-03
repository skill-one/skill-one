import { useTranslation } from "react-i18next";

import { formatCount } from "../lib/utils";

/**
 * How much there is to read from, stated once in the row's slack: the skill
 * total and the repository total, each in its own unit, in that order, whatever
 * shape the list is read in.
 *
 * **Both figures, always, and never following the shape.** A count that followed
 * the shape would be the `全部` figure the scope picker already states beside it —
 * the same number twice on one row. What the picker cannot say is the figure for
 * the shape the reader is *not* in: the skills behind the cards, the repositories
 * behind the rows. This is that figure, and the only place both live at once.
 *
 * It is a readout, not a control: nothing here narrows, orders or switches, and
 * it stays put while the other three answers move — including while a question
 * is live, because it answers about the corpus rather than about the answer on
 * screen. The search answer's own size is the sections' badge
 * (`CollapsibleSection`).
 *
 * The two figures are worded apart on the installed list, where a repository is
 * only a *source*: a machine holding one skill from a repository holds no
 * repository, and the store's own `repoCount` would read as a claim about the
 * registry rather than about this machine.
 *
 * Compacted for print (`formatCount`), with the exact pair as the title, because
 * a corpus figure climbs while a download streams and a raw five-digit number
 * would widen the row on every chunk. It is plain text rather than a live region
 * for the same reason: a readout that announced itself would narrate the
 * download.
 */
export function ListCorpus({
  skills,
  repos,
  variant = "registry",
}: {
  /** How many skills the corpus holds. */
  skills: number;
  /**
   * How many repositories it holds. On the installed list this counts the
   * recorded sources only — the pool of source-less installs is a card on that
   * list, not a repository of its own.
   */
  repos: number;
  /** Which corpus is being read: the registry's, or this machine's. */
  variant?: "registry" | "installed";
}) {
  const { t } = useTranslation();

  return (
    <p
      title={`${skills} · ${repos}`}
      className="flex shrink-0 items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground tabular-nums"
    >
      <span>{t("state.skillCount", { count: formatCount(skills) })}</span>
      <span aria-hidden="true">·</span>
      <span>
        {t(
          variant === "installed" ? "state.sourceRepoCount" : "state.repoCount",
          { count: formatCount(repos) },
        )}
      </span>
    </p>
  );
}