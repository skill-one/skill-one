import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Puzzle,
  RefreshCw,
  Trash2,
  PackageOpen,
} from "lucide-react";

import {
  fetchInstalledSkills,
  removeInstalledSkill,
  updateInstalledSkill,
} from "../lib/local-skills";
import type { InstalledSkill } from "../lib/skills-manager";
import { Button } from "./ui/button";

const QUERY_KEY = ["installed-skills"] as const;

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex w-fit items-center gap-3 rounded-xl border border-border/70 bg-card px-4 py-3">
      <span className="text-[22px] font-semibold leading-none tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-[12px] text-muted-foreground">{label}</span>
    </div>
  );
}

function SkillRow({
  skill,
  updating,
  removing,
  onUpdate,
  onRemove,
}: {
  skill: InstalledSkill;
  updating: boolean;
  removing: boolean;
  onUpdate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center gap-4 rounded-xl border border-border/70 bg-card p-3.5 transition-all duration-150 hover:border-border hover:shadow-[0_6px_20px_-12px_rgba(15,23,42,0.15)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground transition-colors">
        <Puzzle className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[14px] font-semibold text-foreground">
            {skill.name}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {skill.source}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {skill.sourceType}
          {skill.agents.length > 0 &&
            ` · 已链接 ${skill.agents.join(", ")}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          title="更新"
          disabled={updating}
          onClick={onUpdate}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {updating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </button>
        <button
          title="移除"
          disabled={removing}
          onClick={onRemove}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          {removing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </button>
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
    refetch,
  } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: fetchInstalledSkills,
    staleTime: 0,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });

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
    <div className="mx-auto flex h-full w-full max-w-[1180px] flex-col px-8 py-5">
      {/* Header */}
      <div className="flex items-end justify-between pb-5">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight text-foreground">
            我的 Skills
          </h2>
          <p className="mt-1 text-[12px] text-muted-foreground">
            管理已安装的技能：检查来源、更新或移除。
          </p>
        </div>
        <Button asChild>
          <Link to="/explore">
            <Plus className="h-4 w-4" />
            添加技能
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="pb-5">
        <StatCard label="已安装（全局）" value={list.length} />
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-6 pr-1">
        {isError ? (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <PackageOpen className="h-8 w-8 opacity-40" />
            <p className="text-[13px]">
              加载失败：{error instanceof Error ? error.message : "未知错误"}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void refetch()}
            >
              重试
            </Button>
          </div>
        ) : isLoading ? (
          <div className="flex h-full min-h-[260px] items-center justify-center text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : list.length > 0 ? (
          <div className="flex flex-col gap-2">
            {list.map((skill) => (
              <SkillRow
                key={skill.name}
                skill={skill}
                updating={
                  updateMutation.isPending &&
                  updateMutation.variables === skill.name
                }
                removing={
                  removeMutation.isPending &&
                  removeMutation.variables === skill.name
                }
                onUpdate={() => updateMutation.mutate(skill.name)}
                onRemove={() => removeMutation.mutate(skill.name)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-muted-foreground">
            <PackageOpen className="h-8 w-8 opacity-40" />
            <p className="text-[13px]">还没有安装任何技能</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to="/explore">去探索</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
