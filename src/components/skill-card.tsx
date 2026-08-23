import { useState } from "react";
import { Star, Check, Download } from "lucide-react";

import { cn, formatStars } from "../lib/utils";
import type { Skill } from "../types/skill";
import { Button } from "./ui/button";

/**
 * A single curated skill card.
 *
 * The card body opens the detail panel (`onSelect`); the install action is
 * purely local UI state (toggles to a disabled "已安装" button) and does not
 * persist or trigger any real installation.
 */
export function SkillCard({
  skill,
  selected = false,
  onSelect,
}: {
  skill: Skill;
  /** Whether this card is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel. */
  onSelect?: () => void;
}) {
  const [installed, setInstalled] = useState(false);

  const owner = skill.repo.split("/")[0];
  const avatarUrl = `https://github.com/${owner}.png`;

  return (
    <article
      onClick={onSelect}
      onKeyDown={(e) => {
        if (onSelect && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={onSelect ? `查看 ${skill.name} 详情` : undefined}
      className={cn(
        "group relative flex flex-col rounded-xl border border-border/70 bg-card p-4 transition-all duration-150",
        onSelect && "cursor-pointer hover:-translate-y-0.5 hover:border-border hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.18)]",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src={avatarUrl}
            alt={`${owner} 的头像`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-9 w-9 shrink-0 rounded-full border border-border/60 bg-muted"
          />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {skill.name}
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {skill.repo}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant={installed ? "secondary" : "default"}
          disabled={installed}
          onClick={(e) => {
            // Keep the click from opening the detail panel.
            e.stopPropagation();
            setInstalled(true);
          }}
          className={cn("h-7 shrink-0 px-2.5 text-[12px]")}
        >
          {installed ? (
            <>
              <Check className="h-3.5 w-3.5" />
              已安装
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              安装
            </>
          )}
        </Button>
      </div>

      {skill.description && (
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          {skill.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1 text-[12px] text-muted-foreground">
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        <span className="font-medium tabular-nums">
          {formatStars(skill.stars)}
        </span>
      </div>
    </article>
  );
}
