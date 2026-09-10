import { useState, type ReactNode } from "react";
import { Download, Flame, Star, type LucideIcon } from "lucide-react";

import type { SearchField } from "../../lib/registry/protocol";
import { popularity } from "../../lib/popularity";
import { cn, formatCount } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { OwnerAvatar } from "../../components/owner-avatar";
import { DomainBadge } from "../../components/domain-badge";
import { SkillInstallButton } from "../../components/skill-install-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Matched indexed terms per field, from the search that produced this hit. */
export type SkillMatched = Partial<Record<SearchField, readonly string[]>>;

/**
 * One labelled row of the popularity tooltip — icon, field name and a
 * right-aligned value, so the blended figure and the two counts behind it read
 * as the same kind of line.
 */
function TooltipRow({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  /** Colour for the icon only (the star's amber). */
  tone?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn("h-3.5 w-3.5", tone)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

/**
 * Splits text on the same separator class MiniSearch's default tokenizer uses,
 * so each non-separator segment is exactly one indexed token and can be
 * compared to the matched terms (which are always whole tokens).
 */
const TOKEN_SPLIT = /([\n\r\p{Z}\p{P}]+)/u;

/**
 * Text with search-match highlighting: tokens present in `terms` are wrapped in
 * `<mark>`. Without terms the text renders as a single node, keeping the
 * non-search DOM identical to an unhighlighted one.
 */
function HighlightedText({
  text,
  terms,
}: {
  text: string;
  terms?: readonly string[];
}) {
  if (!terms?.length) return text;
  const matched = new Set(terms);
  return (
    <>
      {text.split(TOKEN_SPLIT).map((segment, i) =>
        matched.has(segment.toLowerCase()) ? (
          <mark
            key={i}
            className="rounded-[2px] bg-primary/15 text-inherit dark:bg-primary/25"
          >
            {segment}
          </mark>
        ) : (
          segment
        ),
      )}
    </>
  );
}

/**
 * One skill in the store's list — the shape every skill surface uses: avatar,
 * name and source, description, popularity figure and the install action on a
 * single line, in the reading order of a leaderboard row. Hovering or focusing
 * the figure breaks it back down into the installs and stars it blends.
 *
 * The row body opens the detail panel (`onSelect`); the install action goes
 * through the skills backend (Tauri) or the mock store (browser), reflects
 * loading / success / failure, and stops its own click so it never opens the
 * panel behind it. A failed install reports its message under the row.
 */
export function SkillListRow({
  skill,
  matched,
  selected = false,
  onSelect,
  leading,
  metric,
}: {
  skill: Skill;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillMatched;
  /** Whether this row is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel. */
  onSelect?: () => void;
  /** Slot before the avatar — a leaderboard rank badge. */
  leading?: ReactNode;
  /** Replaces the popularity metric when the surface has its own unit. */
  metric?: ReactNode;
}) {
  // The failure message of the last install attempt, shown under the row.
  const [installError, setInstallError] = useState<string | null>(null);

  const owner = skill.repo.split("/")[0];

  // Formatted once: the trigger, its accessible name and the tooltip lines all
  // read these, so they cannot disagree about what the figure is.
  const installed = formatCount(skill.downloads);
  const starred = formatCount(skill.stars);
  const blended = formatCount(popularity(skill));

  return (
    <li>
      <div
        role={onSelect ? "button" : undefined}
        tabIndex={onSelect ? 0 : undefined}
        aria-label={onSelect ? `查看 ${skill.name} 详情` : undefined}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (onSelect && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "flex items-center gap-4 rounded-xl border border-border/70 bg-card px-3.5 py-3 transition-all duration-150",
          onSelect &&
            "cursor-pointer hover:-translate-y-px hover:border-border hover:bg-accent/40 hover:shadow-[0_8px_24px_-16px_rgba(15,23,42,0.25)]",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        {leading}
        <OwnerAvatar owner={owner} className="h-10 w-10 text-[15px]" />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h3 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
              <HighlightedText text={skill.name} terms={matched?.name} />
            </h3>
            <span className="truncate text-[12px] text-muted-foreground">
              <HighlightedText text={skill.repo} terms={matched?.repo} />
            </span>
            {/* Domain from the profiles dataset; absent for skills it has
                not profiled, so most rows stay unchanged for now. */}
            {skill.profile?.domain && (
              <DomainBadge
                domain={skill.profile.domain}
                reason={skill.profile.reason}
                className="shrink-0 rounded-full px-2 py-0 text-[10px] font-normal text-muted-foreground"
              />
            )}
          </div>
          <p className="mt-0.5 hidden truncate text-[13px] leading-relaxed text-muted-foreground lg:block">
            <HighlightedText
              text={skill.description || "暂无描述"}
              terms={matched?.description}
            />
          </p>
        </div>

        {/* Like the install action, the metric is its own control: a click on
            it stops there instead of opening the detail panel behind the row. */}
        {metric ?? (
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger
                aria-label={`热度 ${blended}：安装 ${installed} · Star ${starred}`}
                onClick={(e) => e.stopPropagation()}
                className="flex shrink-0 cursor-default items-center gap-1 rounded text-[12px] text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
              >
                <Flame className="h-3.5 w-3.5" />
                <span className="font-medium tabular-nums">{blended}</span>
              </TooltipTrigger>
              <TooltipContent side="right" align="start">
                <div className="flex flex-col gap-1.5 text-[12px]">
                  <TooltipRow icon={Flame} label="热度" value={blended} />
                  <TooltipRow icon={Download} label="安装" value={installed} />
                  <TooltipRow
                    icon={Star}
                    label="Star"
                    value={starred}
                    tone="text-amber-400"
                  />
                  {/* The relationship the three figures above have to each
                      other: the blend is a geometric mean, so neither count
                      can outrun the other — the question this line answers
                      is "why is 3M installs only 713K heat?". */}
                  <p className="border-t border-border/60 pt-1.5 text-[11px] leading-relaxed text-muted-foreground/80">
                    热度 = √(安装 × Star)，安装与 Star 各占一半
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* The install button stops its own click, so it never opens the
            detail panel behind it. */}
        <SkillInstallButton skill={skill} onError={setInstallError} />
      </div>

      {installError && (
        <p
          role="alert"
          className="mt-1 line-clamp-2 px-3.5 text-[12px] leading-relaxed text-destructive"
        >
          {installError}
        </p>
      )}
    </li>
  );
}
