import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Puzzle, RefreshCw, Trash2, Users } from "lucide-react";

import { removeInstalledSkill, setSkillEnabled } from "../../lib/local-skills";
import type { InstalledSkill } from "../../lib/skills-manager";
import type { SkillRef } from "../../lib/registry/protocol";
import { cn } from "../../lib/utils";
import {
  INSTALLED_SKILLS_QUERY_KEY,
  useInstalledSkills,
} from "../../hooks/use-installed-skills";
import { useRegistrySkillMeta } from "../../hooks/use-registry-skill-meta";
import { AgentAvatarMenu } from "./agent-avatar-menu";
import { OwnerAvatar } from "../../components/owner-avatar";
import { Button } from "../../components/ui/button";
import { Switch } from "../../components/ui/switch";

function sourceLabelFor(skill: InstalledSkill): string {
  // No source record (e.g. placed manually into the global directory) or an
  // explicit local source both mean this is a local skill.
  if (!skill.sourceType || skill.sourceType === "local") return "本地";
  return skill.source || skill.sourceType || "本地";
}

function SkillCardItem({
  skill,
  enabled,
  onToggle,
  onRemove,
  removing,
  description,
}: {
  skill: InstalledSkill;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onRemove: () => void;
  removing: boolean;
  description: string;
}) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-border hover:shadow-[0_6px_20px_-12px_rgba(15,23,42,0.15)]",
        !enabled && "opacity-60",
      )}
    >
      {/* Top: avatar + name + source; the right side stays empty for the toggle in the top-right corner. */}
      <div className="flex items-start gap-3 pr-12">
        {skill.sourceType !== "local" && skill.source?.includes("/") ? (
          <OwnerAvatar
            owner={skill.source.split("/")[0]}
            className="h-10 w-10 text-[16px]"
          />
        ) : (
          <div
            aria-label="skill 头像"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted text-muted-foreground"
          >
            <Puzzle className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1 pt-1.5">
          <h3
            className={cn(
              "truncate text-[14px] font-semibold",
              enabled ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {skill.name}
          </h3>
          <p
            className={cn(
              "mt-0.5 truncate text-[12px]",
              enabled ? "text-muted-foreground" : "text-muted-foreground/70",
            )}
          >
            {sourceLabelFor(skill)}
          </p>
        </div>
      </div>

      {/* Top-right corner: enable toggle */}
      <div className="absolute right-4 top-4">
        <Switch
          checked={enabled}
          onCheckedChange={onToggle}
          aria-label={`${enabled ? "关闭" : "开启"} ${skill.name}`}
        />
      </div>

      {/* Description: the disk-extracted SKILL.md description for local skills;
          store-sourced ones fall back to the registry description. */}
      <p className="mt-3 line-clamp-2 min-h-[2.5em] text-[12px] leading-relaxed text-muted-foreground">
        {description || "暂无描述"}
      </p>

      {/* Bottom: right-aligned actions (remove). */}
      <div className="mt-3 flex items-center justify-end">
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            title="移除"
            disabled={removing}
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function MySkillsPage() {
  const queryClient = useQueryClient();

  const { data: skills, isLoading, isError, error } = useInstalledSkills();

  const list = skills ?? [];

  // Registry metadata (downloads / descriptions) for store-sourced skills,
  // resolved inside the registry worker. Best-effort: until the worker is
  // ready (or on failure) the map stays empty and the page degrades to
  // hiding downloads and disk-extracted descriptions only — the same
  // all-or-nothing contract the full download used to provide.
  const refs = useMemo<SkillRef[]>(
    () => list.map((skill) => ({ repo: skill.source ?? "", name: skill.name })),
    [list],
  );
  const meta = useRegistrySkillMeta(refs);

  // Enablement is a real backend state (the agents-skills library moves the
  // skill between the canonical and disabled dirs), reported by `skill.enabled`.
  // We keep a small optimistic override while a toggle mutation is in flight;
  // once the list refetches after the mutation, `skill.enabled` is the truth.
  const [pendingEnabled, setPendingEnabled] = useState<Record<string, boolean>>(
    {},
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: INSTALLED_SKILLS_QUERY_KEY });

  const removeMutation = useMutation({
    mutationFn: (name: string) => removeInstalledSkill(name),
    onSuccess: invalidate,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      setSkillEnabled(name, enabled),
    onMutate: ({ name, enabled }) =>
      setPendingEnabled((prev) => ({ ...prev, [name]: enabled })),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: INSTALLED_SKILLS_QUERY_KEY,
      });
      setPendingEnabled({});
    },
    onError: () => {
      setPendingEnabled({});
      invalidate();
    },
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {/* Summary strip: agent link status at a glance, with the link
            actions inside the avatar group's dropdown menu. */}
        <div className="border-b border-border/70 pb-4">
          <AgentAvatarMenu />
        </div>

        <div className="mt-4">
          <div className="mb-3 flex items-baseline gap-2">
            <span className="text-[15px] font-semibold text-foreground">
              {list.length}
            </span>
            <span className="text-[12px] text-muted-foreground">已安装</span>
          </div>
          {isError ? (
            <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
              <Users className="h-7 w-7 opacity-40" />
              <p className="text-[12px]">
                加载失败：{error instanceof Error ? error.message : "未知错误"}
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <RefreshCw className="h-6 w-6 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
              <p className="text-[13px]">还没有安装任何技能</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              {list.map((skill) => {
                const indexEntry = meta.get(`${skill.source}/${skill.name}`);
                return (
                  <SkillCardItem
                    key={skill.name}
                    skill={skill}
                    enabled={pendingEnabled[skill.name] ?? skill.enabled}
                    onToggle={(enabled) =>
                      toggleMutation.mutate({ name: skill.name, enabled })
                    }
                    onRemove={() => removeMutation.mutate(skill.name)}
                    removing={
                      removeMutation.isPending &&
                      removeMutation.variables === skill.name
                    }
                    description={
                      skill.description ?? indexEntry?.description ?? ""
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
