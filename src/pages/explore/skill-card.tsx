import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Star, Check, Download, Loader2, RefreshCw } from "lucide-react";

import { installSkillFromSource } from "../../lib/local-skills";
import type { SkillSearchField } from "../../lib/search-skills";
import { cn, formatCount } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { Button } from "../../components/ui/button";
import { OwnerAvatar } from "../../components/owner-avatar";

/** Install button state machine: idle → installing → installed | error. */
type InstallState = "idle" | "installing" | "installed" | "error";

/** Matched indexed terms per field, from the search that produced this hit. */
export type SkillCardMatched = Partial<
  Record<SkillSearchField, readonly string[]>
>;

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

/** Best-effort message from a rejection; Tauri rejects with a non-`Error` value. */
function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return "安装失败，请重试";
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
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [installError, setInstallError] = useState<string | null>(null);

  const queryClient = useQueryClient();

  const owner = skill.repo.split("/")[0];

  const handleInstall = async (e: React.MouseEvent) => {
    // Keep the click from opening the detail panel.
    e.stopPropagation();
    if (installState === "installing" || installState === "installed") return;
    setInstallState("installing");
    setInstallError(null);
    try {
      await installSkillFromSource(skill.repo, skill.name);
      // The "my skills" page caches its list for 10 minutes (staleTime) and
      // never GCs it, so invalidate here to make the newly installed skill
      // show up there on the next visit.
      await queryClient.invalidateQueries({ queryKey: ["installed-skills"] });
      setInstallState("installed");
    } catch (err) {
      setInstallState("error");
      setInstallError(toErrorMessage(err));
    }
  };

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
        <Button
          size="sm"
          variant={installState === "installed" ? "secondary" : "default"}
          disabled={
            installState === "installing" || installState === "installed"
          }
          onClick={(e) => void handleInstall(e)}
          className={cn("h-7 shrink-0 px-2.5 text-[12px]")}
        >
          {installState === "installing" ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              安装中
            </>
          ) : installState === "installed" ? (
            <>
              <Check className="h-3.5 w-3.5" />
              已安装
            </>
          ) : installState === "error" ? (
            <>
              <RefreshCw className="h-3.5 w-3.5" />
              重试
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

      {installState === "error" && installError && (
        <p
          role="alert"
          className="mt-2 line-clamp-2 text-[12px] leading-relaxed text-red-600"
        >
          {installError}
        </p>
      )}
    </article>
  );
}
