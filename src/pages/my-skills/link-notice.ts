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
  linked: { kind: "success", text: (r) => `${r.display} 已链接` },
  alreadyLinked: { kind: "success", text: (r) => `${r.display} 已链接过` },
  migrated: {
    kind: "success",
    text: (r) =>
      `${r.display} 已迁移（移动 ${r.moved.length} 个，跳过 ${r.skipped.length} 个）`,
  },
  refused: {
    kind: "warning",
    text: (r) => `${r.display} 拒绝：${r.message ?? "未提供原因"}`,
  },
  skipped: { kind: "success", text: (r) => `${r.display} 已跳过` },
  failed: {
    kind: "error",
    text: (r) => `${r.display} 失败：${r.message ?? "未知错误"}`,
  },
  unlinked: { kind: "success", text: (r) => `${r.display} 已取消链接` },
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
