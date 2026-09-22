import { useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Download, Loader2, RefreshCw } from "lucide-react";

import { installSkillFromSource } from "../lib/local-skills";
import {
  markSkillsChanged,
  useInstalledSkills,
} from "../hooks/use-installed-skills";
import { useSkillProvenance } from "../hooks/use-skill-provenance";
import { cn, errorMessage } from "../lib/utils";
import { toast } from "./ui/toast";
import type { Skill } from "../types/skill";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

/** Install button state machine: idle → installing → installed | error. */
export type InstallState = "idle" | "installing" | "installed" | "error";

/**
 * Icon-only install button content per state. The label doubles as the
 * sr-only accessible name and the hover tooltip text, since the button
 * itself renders no visible text.
 *
 * The installed state is a status badge rather than a control: a tinted
 * `--success` surface the check inherits its color from — louder than the
 * muted secondary chrome, quieter than a solid green button a disabled control
 * has no business wearing. `cn` merges these over the variant's classes.
 */
const INSTALL_BUTTON: Record<
  InstallState,
  {
    label: string;
    icon: ReactElement;
    variant: "default" | "secondary";
    className?: string;
  }
> = {
  // Idle is the resting state of every row in a grid, so it wears the muted
  // secondary chrome and stays out of the name's way. The states that do need
  // attention — installing, retry — keep the solid primary.
  idle: { label: "安装", icon: <Download />, variant: "secondary" },
  installing: {
    label: "安装中",
    icon: <Loader2 className="animate-spin" />,
    variant: "default",
  },
  installed: {
    label: "已安装",
    icon: <Check />,
    variant: "secondary",
    className:
      "border-transparent bg-success/10 text-success hover:bg-success/15",
  },
  error: { label: "重试", icon: <RefreshCw />, variant: "default" },
};

/**
 * The install action shared by every skill surface (store rows, leaderboard
 * rows): a real install through the skills backend (Tauri) or the mock store
 * (browser), reflected as idle → installing → installed | error.
 *
 * A failure is reported twice and identically from here: the button's own 重试
 * state, and the app-wide toast every other write path uses (see
 * `SkillRemoveButton`). Nothing a row or a detail view carries.
 *
 * Two shapes: the default icon-only button for dense list rows, and a
 * `labeled` compact button with the state word visible — the primary action
 * of a detail view, where a lone corner icon is too weak.
 */
export function SkillInstallButton({
  skill,
  className,
  labeled = false,
}: {
  skill: Skill;
  /** Merged onto the button; callers size and place it. */
  className?: string;
  /** Show the state label next to the icon (detail views). */
  labeled?: boolean;
}) {
  const [installState, setInstallState] = useState<InstallState>("idle");

  const queryClient = useQueryClient();

  // The install button reflects the persisted install state, not just this
  // session: skills already present in the global skills directory render as
  // 已安装 (disabled) before any click. Sharing the "my skills" query keeps
  // store rows in sync with installs/removals done elsewhere; React Query
  // dedupes the shared key so a page of rows issues a single fetch.
  const { data: installedSkills } = useInstalledSkills();
  // The app's own install-source ledger (see lib/provenance.ts). Undefined
  // while loading and for skills installed by other tools — both degrade to
  // the name-only match below.
  const { data: provenanceState } = useSkillProvenance();

  const installing = installState === "installing";
  // A skill with this name is already on disk, and it is *this* skill: when
  // the ledger has a source for the name, it must match the store entry's
  // repo — a same-named skill from a different repo must stay installable.
  // Without a ledger entry the association is unknown, so the name match
  // stands (the pre-ledger behavior).
  const provenance = provenanceState?.linked[skill.name];
  const isInstalled =
    installState === "installed" ||
    !!installedSkills?.some(
      (s) =>
        s.name === skill.name && (!provenance || provenance.repo === skill.repo),
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
    try {
      // The store entry's rev travels along as the installed version marker
      // (see installSkillFromSource): the future update check compares it
      // against the latest index rev.
      await installSkillFromSource(skill.repo, skill.name, { rev: skill.rev });
      // The "my skills" list is cached for 10 minutes (staleTime) and never
      // GCs, so refresh this window and broadcast the change: invalidate here
      // makes the new skill show up on the next visit, and the broadcast lets
      // the menu bar popover (its own webview + cache) update live.
      await markSkillsChanged(queryClient);
      setInstallState("installed");
    } catch (err) {
      setInstallState("error");
      toast.add({ title: errorMessage(err, "安装失败，请重试"), type: "error" });
    }
  };

  // The labeled shape already shows its state word, so it needs neither the
  // hover tooltip nor the icon-only sizing.
  if (labeled) {
    return (
      <Button
        variant={installMeta.variant}
        size="sm"
        disabled={installing || isInstalled}
        onClick={(e) => void handleInstall(e)}
        className={cn("h-8 shrink-0 gap-1.5 px-3", installMeta.className, className)}
      >
        {installMeta.icon}
        {installMeta.label}
      </Button>
    );
  }

  // `data-state` puts the resolved state on the DOM button so a caller can
  // style around it: the store's repository card keeps an installed badge on
  // screen from this attribute without knowing the state itself (see `RepoCard`).
  return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              size="icon"
              variant={installMeta.variant}
              disabled={installing || isInstalled}
              data-state={state}
              onClick={(e) => void handleInstall(e)}
              className={cn(
                "h-7 w-7 shrink-0",
                installMeta.className,
                className,
              )}
            >
              {installMeta.icon}
              <span className="sr-only">{installMeta.label}</span>
            </Button>
          }
        />
        <TooltipContent>{installMeta.label}</TooltipContent>
      </Tooltip>
  );
}
