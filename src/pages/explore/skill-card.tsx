import { useState } from "react";
import { Star, Download } from "lucide-react";

import type { SearchField } from "../../lib/registry/protocol";
import { cn, formatCount } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { OwnerAvatar } from "../../components/owner-avatar";
import { SkillInstallButton } from "./skill-install-button";

/** Matched indexed terms per field, from the search that produced this hit. */
export type SkillCardMatched = Partial<Record<SearchField, readonly string[]>>;

/**
 * Splits text on the same separator class MiniSearch's default tokenizer
 * uses, so each non-separator segment is exactly one indexed token and can
 * be compared to the matched terms (which are always whole tokens).
 */
const TOKEN_SPLIT = /([\n\r\p{Z}\p{P}]+)/u;

/**
 * Text with search-match highlighting: tokens present in `terms` are wrapped
 * in `<mark>`. Without terms the text renders as a single node, keeping the
 * non-search DOM identical to before.
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
 * A single curated skill card.
 *
 * The card body opens the detail panel (`onSelect`); the install action
 * triggers a real install through the skills backend (Tauri) or the mock
 * store (browser), and reflects loading / success / failure accordingly.
 */
export function SkillCard({
  skill,
  matched,
  selected = false,
  onSelect,
}: {
  skill: Skill;
  /** Search-hit highlights; absent outside a search (nothing highlighted). */
  matched?: SkillCardMatched;
  /** Whether this card is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel. */
  onSelect?: () => void;
}) {
  // The failure message of the last install attempt, shown under the card.
  const [installError, setInstallError] = useState<string | null>(null);

  const owner = skill.repo.split("/")[0];

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
        onSelect &&
          "cursor-pointer hover:-translate-y-0.5 hover:border-border hover:shadow-[0_10px_30px_-14px_rgba(15,23,42,0.18)]",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <OwnerAvatar owner={owner} className="h-9 w-9 text-[15px]" />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              <HighlightedText text={skill.name} terms={matched?.name} />
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              <HighlightedText text={skill.repo} terms={matched?.repo} />
            </p>
          </div>
        </div>
        <SkillInstallButton skill={skill} onError={setInstallError} />
      </div>

      {skill.description && (
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
          <HighlightedText
            text={skill.description}
            terms={matched?.description}
          />
        </p>
      )}

      <div className="mt-3 flex items-center gap-4 text-[12px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Download className="h-3.5 w-3.5" />
          <span className="font-medium tabular-nums">
            {formatCount(skill.downloads)}
          </span>
        </span>
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
          <span className="font-medium tabular-nums">
            {formatCount(skill.stars)}
          </span>
        </span>
      </div>

      {installError && (
        <p
          role="alert"
          className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-destructive"
        >
          {installError}
        </p>
      )}
    </article>
  );
}
