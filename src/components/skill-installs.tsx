import { useTranslation } from "react-i18next";
import { Download } from "lucide-react";

import { cn, formatCount } from "../lib/utils";
import type { Skill } from "../types/skill";

/**
 * The one install figure every skill surface shows (list rows and the detail
 * drawer's meta row), so the number on a row and the number in the detail can
 * never disagree.
 *
 * It is a count, and it is the skill's own: the glyph marks the metric where a
 * row's other facts carry theirs (a star, a classification), the figure is that
 * count compacted, and the exact number stays reachable as the title. The
 * wording is for assistive tech only — a bare "3M" beside a name says nothing —
 * and it never appears on screen, where the glyph is the label.
 *
 * No tooltip: a tooltip exists to reveal what a figure is *made of*, and this
 * one is made of nothing.
 */
export function SkillInstalls({
  skill,
  className,
}: {
  skill: Skill;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <span
      title={t("common.installsTitle", {
        count: skill.downloads.toLocaleString("en-US"),
      })}
      className={cn(
        "flex shrink-0 cursor-default items-center gap-1 text-[12px] text-muted-foreground",
        className,
      )}
    >
      <Download aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="sr-only">{t("common.installs")}</span>
      <span className="font-medium tabular-nums">
        {formatCount(skill.downloads)}
      </span>
    </span>
  );
}
