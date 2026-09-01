import { useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Loader2, RefreshCw } from "lucide-react";

import { installSkillFromSource } from "../../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../../hooks/use-installed-skills";
import { cn } from "../../lib/utils";
import type { Skill } from "../../types/skill";
import { Button } from "../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";

/** Install button state machine: idle → installing → installed | error. */
type InstallState = "idle" | "installing" | "installed" | "error";

/**
 * Icon-only install button content per state. The label doubles as the
 * sr-only accessible name and the hover tooltip text, since the button
 * itself renders no visible text.
 */
const INSTALL_BUTTON: Record<
  InstallState,
  { label: string; icon: ReactElement; variant: "default" | "secondary" }
> = {
  idle: { label: "安装", icon: <Download />, variant: "default" },
  installing: {
    label: "安装中",
    icon: <Loader2 className="animate-spin" />,
    variant: "default",
  },
  installed: { label: "已安装", icon: <Check />, variant: "secondary" },
  error: { label: "重试", icon: <RefreshCw />, variant: "default" },
};

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
 * The install action shared by every skill surface (store cards, leaderboard
 * rows): a real install through the skills backend (Tauri) or the mock store
 * (browser), reflected as idle → installing → installed | error.
 *
 * `onError` hands the failure message to the caller, which decides where to
 * show it; without one the failure still shows up as the button's 重试 state.
 */
export function SkillInstallButton({
  skill,
  className,
  onError,
}: {
  skill: Skill;
  /** Merged onto the button; callers size and place it. */
  className?: string;
  /** Called with the failure message, or null once the install succeeds. */
  onError?: (message: string | null) => void;
}) {
  const [installState, setInstallState] = useState<InstallState>("idle");

  const queryClient = useQueryClient();

  // The install button reflects the persisted install state, not just this
  // session: skills already present in the global skills directory render as
  // 已安装 (disabled) before any click. Sharing the "my skills" query keeps
  // store cards in sync with installs/removals done elsewhere; React Query
  // dedupes the shared key so a page of cards issues a single fetch.
  const { data: installedSkills } = useInstalledSkills();

  const installing = installState === "installing";
  const isInstalled =
    installState === "installed" ||
    !!installedSkills?.some(
      (s) => s.name === skill.name && s.source === skill.repo,
    );
  // Installing outranks "already on disk" (the click is in flight), and the
  // on-disk state outranks a stale local one.
  const state: InstallState = installing
    ? "installing"
    : isInstalled
      ? "installed"
      : installState;
  const installMeta = INSTALL_BUTTON[state];

  const handleInstall = async (e: React.MouseEvent) => {
    // Keep the click from opening the detail panel behind this button.
    e.stopPropagation();
    if (installState === "installing" || installState === "installed") return;
    setInstallState("installing");
    onError?.(null);
    try {
      await installSkillFromSource(skill.repo, skill.name);
      // The "my skills" list is cached for 10 minutes (staleTime) and never
      // GCs, so refresh this window and broadcast the change: invalidate here
      // makes the new skill show up on the next visit, and the broadcast lets
      // the menu bar popover (its own webview + cache) update live.
      await markSkillsChanged(queryClient);
      setInstallState("installed");
    } catch (err) {
      setInstallState("error");
      onError?.(toErrorMessage(err));
    }
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant={installMeta.variant}
            disabled={installing || isInstalled}
            onClick={(e) => void handleInstall(e)}
            className={cn("h-7 w-7 shrink-0", className)}
          >
            {installMeta.icon}
            <span className="sr-only">{installMeta.label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>{installMeta.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
