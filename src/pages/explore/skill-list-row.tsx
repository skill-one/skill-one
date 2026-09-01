import { useState } from "react";
import { Download } from "lucide-react";

import type { SearchField } from "../../lib/registry/protocol";
import { cn, formatCount } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { OwnerAvatar } from "../../components/owner-avatar";
import { SkillInstallButton } from "./skill-install-button";

/** Matched indexed terms per field, from the search that produced this hit. */
export type SkillMatched = Partial<Record<SearchField, readonly string[]>>;

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
 * name and source, description, download count and the install action on a
 * single line, in the reading order of a leaderboard row.
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
}: {
  skill: Skill;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillMatched;
  /** Whether this row is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel. */
  onSelect?: () => void;
}) {
  // The failure message of the last install attempt, shown under the row.
  const [installError, setInstallError] = useState<string | null>(null);

  const owner = skill.repo.split("/")[0];

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
        <OwnerAvatar owner={owner} className="h-10 w-10 text-[15px]" />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-2">
            <h3 className="truncate text-[14px] font-semibold tracking-tight text-foreground">
              <HighlightedText text={skill.name} terms={matched?.name} />
            </h3>
            <span className="truncate text-[12px] text-muted-foreground">
              <HighlightedText text={skill.repo} terms={matched?.repo} />
            </span>
          </div>
          <p className="mt-0.5 hidden truncate text-[13px] leading-relaxed text-muted-foreground lg:block">
            <HighlightedText
              text={skill.description || "暂无描述"}
              terms={matched?.description}
            />
          </p>
        </div>

        <span className="flex shrink-0 items-center gap-1 text-[12px] text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          <span className="font-medium tabular-nums">
            {formatCount(skill.downloads)}
          </span>
        </span>

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
