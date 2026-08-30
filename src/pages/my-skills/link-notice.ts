import type { AgentLinkResult } from "../../lib/skills-manager";

export type NoticeKind = "success" | "warning" | "error";

export interface Notice {
  text: string;
  kind: NoticeKind;
}

/**
 * Link outcome → toast: semantic color + message template in one table, so a
 * new backend status only needs one entry instead of parallel switch arms in
 * a color mapper and a text formatter.
 */
const STATUS_NOTICES: Record<
  AgentLinkResult["status"],
  { kind: NoticeKind; text: (result: AgentLinkResult) => string }
> = {
  linked: {
    kind: "success",
    text: (r) =>
      r.parkedSkills.length + r.parkedOthers.length > 0
        ? `${r.display} 已链接（原有内容已备份，取消链接可恢复）`
        : `${r.display} 已链接`,
  },
  alreadyLinked: { kind: "success", text: (r) => `${r.display} 已链接过` },
  migrated: {
    kind: "success",
    text: (r) => {
      // The common confirm flow adopts skills and parks the rest; with no
      // skills to adopt the outcome is effectively a backed-up link.
      if (r.moved.length === 0) {
        return r.parkedOthers.length > 0
          ? `${r.display} 已链接（原有文件已备份，取消链接可恢复）`
          : `${r.display} 已链接`;
      }
      const parts = [`移动 ${r.moved.length} 个 skills`];
      if (r.skipped.length > 0) parts.push(`同名跳过 ${r.skipped.length} 个`);
      if (r.parkedOthers.length > 0) parts.push("其余文件已备份");
      return `${r.display} 已导入（${parts.join("，")}）`;
    },
  },
  refused: {
    kind: "warning",
    text: (r) => `${r.display} 拒绝链接：${r.message ?? "未提供原因"}`,
  },
  skipped: { kind: "success", text: (r) => `${r.display} 已跳过` },
  failed: {
    kind: "error",
    text: (r) => `${r.display} 失败：${r.message ?? "未知错误"}`,
  },
  unlinked: {
    kind: "success",
    text: (r) =>
      r.restored.length > 0
        ? `${r.display} 已取消链接（已恢复 ${r.restored.length} 项备份内容）`
        : `${r.display} 已取消链接`,
  },
  notLinked: { kind: "warning", text: (r) => `${r.display} 未链接` },
};

/** Link outcome → toast text and semantic color; unknown statuses return null (no toast). */
export function formatLinkMessage(
  result: AgentLinkResult | undefined,
): Notice | null {
  if (!result) return null;
  const entry = STATUS_NOTICES[result.status];
  return entry ? { text: entry.text(result), kind: entry.kind } : null;
}
