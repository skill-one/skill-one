import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, RefreshCw, Trash2, Users } from "lucide-react";

import {
  fetchInstalledSkills,
  removeInstalledSkill,
  updateInstalledSkill,
} from "../lib/local-skills";
import type { InstalledSkill } from "../lib/skills-manager";
import { AgentIconGrid } from "./agent-icon-grid";
import { Button } from "./ui/button";

function SkillCardItem({
  skill,
  onRemove,
  onUpdate,
  removing,
  updating,
}: {
  skill: InstalledSkill;
  onRemove: () => void;
  onUpdate: () => void;
  removing: boolean;
  updating: boolean;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 transition-all duration-150 hover:border-border hover:shadow-[0_6px_20px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold text-foreground">
            {skill.name}
          </h3>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {skill.source ?? "本地来源"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="更新"
            disabled={updating}
            onClick={onUpdate}
          >
            <Download
              className={updating ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
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

  const {
    data: skills,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["installed-skills"],
    queryFn: fetchInstalledSkills,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["installed-skills"] });

  const removeMutation = useMutation({
    mutationFn: (name: string) => removeInstalledSkill(name),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: (name: string) => updateInstalledSkill(name),
    onSuccess: invalidate,
  });

  const list = skills ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {/* 摘要带：agent 链接状态一目了然 */}
        <div className="border-b border-border/70 pb-4">
          <AgentIconGrid />
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
              {list.map((skill) => (
                <SkillCardItem
                  key={skill.name}
                  skill={skill}
                  onRemove={() => removeMutation.mutate(skill.name)}
                  onUpdate={() => updateMutation.mutate(skill.name)}
                  removing={
                    removeMutation.isPending &&
                    removeMutation.variables === skill.name
                  }
                  updating={
                    updateMutation.isPending &&
                    updateMutation.variables === skill.name
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
