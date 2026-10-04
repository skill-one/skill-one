import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Check,
  Copy,
  Loader2,
} from "lucide-react";

import type { AgentStatus, InstalledSkill } from "../../lib/skills-manager";
import { agentLinkState } from "../../lib/agent-link-state";
import { AgentIcon } from "../../components/agent-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";
import { toast } from "../../components/ui/toast";

interface AgentDetailDialogProps {
  agent: AgentStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleLink: (name: string, link: boolean) => void;
  busy?: boolean;
  installedSkills: InstalledSkill[];
}

/**
 * Agent details dialog providing deep inspection and safe link control.
 * Decouples navigation/information inspection from link-toggling actions.
 */
export function AgentDetailDialog({
  agent,
  open,
  onOpenChange,
  onToggleLink,
  busy = false,
  installedSkills,
}: AgentDetailDialogProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!agent) return null;

  const state = agentLinkState(agent);
  const linked = state === "linked";
  const pinned = agent.canonical;
  const enabledSkills = installedSkills.filter((s) => s.enabled);

  const handleCopyPath = async () => {
    // Standard mock or fallback path if not directly on the status payload
    const pathText = `~/.${agent.name}/skills`;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(pathText);
        setCopied(true);
        toast.add({ title: t("agents.detail.pathCopied"), type: "success" });
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      // Ignore clipboard write failures in test/restricted environments
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-3">
            <span className="size-10 shrink-0">
              <AgentIcon agentName={agent.name} shape="squircle" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-semibold">
                  {agent.display}
                </DialogTitle>
                {pinned ? (
                  <Badge variant="outline" className="text-xs">
                    {t("agents.state.canonical")}
                  </Badge>
                ) : state === "warning" ? (
                  <Badge variant="destructive" className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-xs">
                    {t("agents.state.warning")}
                  </Badge>
                ) : linked ? (
                  <Badge variant="success" className="text-xs">
                    {t("agents.state.linked")}
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    {t("agents.state.unlinked")}
                  </Badge>
                )}
              </div>
              <DialogDescription className="text-xs text-muted-foreground truncate">
                {t("agents.detail.title", { name: agent.display })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Link Switch Row */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-card p-3">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">
              {t("agents.detail.toggleLink")}
            </div>
            <div className="text-xs text-muted-foreground">
              {pinned
                ? t("agents.detail.canonicalDesc")
                : linked
                  ? t("agents.state.linked")
                  : t("agents.state.unlinked")}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {busy && (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            )}
            <Switch
              checked={linked}
              disabled={pinned || busy}
              aria-label={t("agents.detail.toggleLink")}
              onCheckedChange={(checked) => onToggleLink(agent.name, checked)}
            />
          </div>
        </div>

        {/* Warning & Conflict Notice */}
        {state === "warning" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400 space-y-2">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="size-4 shrink-0 text-amber-500" />
              <span>{t("agents.detail.warningNotice")}</span>
            </div>
            {(agent.internalSkills?.length ?? 0) > 0 && (
              <div>
                <span className="font-semibold">{t("agents.detail.internalSkills")}: </span>
                <span className="text-muted-foreground">
                  {agent.internalSkills?.join(", ")}
                </span>
              </div>
            )}
            {(agent.internalOthers?.length ?? 0) > 0 && (
              <div>
                <span className="font-semibold">{t("agents.detail.internalOthers")}: </span>
                <span className="text-muted-foreground">
                  {agent.internalOthers?.join(", ")}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Directory Path Info */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            {t("agents.detail.skillsDir")}
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
            <span className="flex-1 truncate select-all">
              ~/.{agent.name}/skills
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0"
              onClick={handleCopyPath}
              title={t("agents.detail.copyPath")}
            >
              {copied ? (
                <Check className="size-3 text-emerald-500" />
              ) : (
                <Copy className="size-3 text-muted-foreground" />
              )}
            </Button>
          </div>
        </div>

        {/* Synced Skills Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>
              {t("agents.detail.syncedSkills", {
                count: linked ? enabledSkills.length : 0,
              })}
            </span>
          </div>
          {linked && enabledSkills.length > 0 ? (
            <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2.5">
              {enabledSkills.map((skill) => (
                <Badge
                  key={skill.name}
                  variant="secondary"
                  className="gap-1 py-0.5 text-xs font-normal"
                >
                  <span>{skill.displayName ?? skill.name}</span>
                </Badge>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-border py-4 text-xs text-muted-foreground">
              {t("agents.detail.noSyncedSkills")}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
