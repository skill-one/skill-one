import type { AgentLinkResult, AgentLinkStatus } from "../../lib/skills-manager";

export type NoticeKind = "success" | "warning" | "error";

export interface Notice {
  text: string;
  kind: NoticeKind;
}

/**
 * Link outcome → toast: semantic color + message template in one table, so a
 * new backend status only needs one entry instead of parallel switch arms in
 * a color mapper and a text formatter.
 *
 * Since agents-skills 0.15 linking is one-way, so the table describes adoption
 * rather than backup: a link reports what it took over (adopted), what it
 * quarantined, and what it dropped as a name clash — and an unlink reports
 * nothing, because nothing comes back.
 */
const STATUS_NOTICES: Record<
  AgentLinkStatus,
  { kind: NoticeKind; text: (result: AgentLinkResult) => string }
> = {
  linked: {
    kind: "success",
    text: (r) => {
      const parts: string[] = [];
      if (r.adopted.length > 0) parts.push(`收编 ${r.adopted.length} 个 skill`);
      if (r.quarantined.length > 0) {
        parts.push(`隔离 ${r.quarantined.length} 项文件`);
      }
      if (r.conflicts.length > 0) parts.push(`同名跳过 ${r.conflicts.length} 个`);
      return parts.length > 0
        ? `${r.display} 已链接（${parts.join("，")}）`
        : `${r.display} 已链接`;
    },
  },
  alreadyLinked: { kind: "success", text: (r) => `${r.display} 已链接过` },
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
    // Nothing is restored: skills adopted at link time stay in the canonical
    // dir (the settings dialog spells that out before the user commits).
    text: (r) => `${r.display} 已取消链接`,
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
