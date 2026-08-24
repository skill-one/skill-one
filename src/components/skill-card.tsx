import { useState } from "react";
import { Star, Check, Download, Loader2, RefreshCw } from "lucide-react";

import { installSkillFromSource } from "../lib/local-skills";
import { cn, formatStars } from "../lib/utils";
import type { Skill } from "../types/skill";
import { Button } from "./ui/button";
import { OwnerAvatar } from "./owner-avatar";

/** Install button state machine: idle → installing → installed | error. */
type InstallState = "idle" | "installing" | "installed" | "error";

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
  selected = false,
  onSelect,
}: {
  skill: Skill;
  /** Whether this card is the one shown in the detail panel. */
  selected?: boolean;
  /** Opens the skill detail panel. */
  onSelect?: () => void;
}) {
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [installError, setInstallError] = useState<string | null>(null);

  const owner = skill.repo.split("/")[0];

  const handleInstall = async (e: React.MouseEvent) => {
    // Keep the click from opening the detail panel.
    e.stopPropagation();
    if (installState === "installing" || installState === "installed") return;
    setInstallState("installing");
    setInstallError(null);
    try {
      await installSkillFromSource(skill.repo, skill.name);
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
              {skill.name}
            </h3>
            <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
              {skill.repo}
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
          {skill.description}
        </p>
      )}

      <div className="mt-3 flex items-center gap-1 text-[12px] text-muted-foreground">
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        <span className="font-medium tabular-nums">
          {formatStars(skill.stars)}
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
