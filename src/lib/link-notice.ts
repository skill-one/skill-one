import type { TFunction } from "i18next";

import type { AgentLinkResult, AgentLinkStatus } from "./skills-manager";

export type NoticeKind = "success" | "warning" | "error";

export interface Notice {
  kind: NoticeKind;
  render: (t: TFunction) => string;
}

/**
 * Link outcome → toast: semantic color + message renderer in one table, so a
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
  {
    kind: NoticeKind;
    render: (t: TFunction, result: AgentLinkResult) => string;
  }
> = {
  linked: {
    kind: "success",
    render: (t, r) => {
      const parts: string[] = [];
      if (r.adopted.length > 0) {
        parts.push(t("link.adopted", { count: r.adopted.length }));
      }
      if (r.quarantined.length > 0) {
        parts.push(t("link.quarantined", { count: r.quarantined.length }));
      }
      if (r.conflicts.length > 0) {
        parts.push(t("link.conflicts", { count: r.conflicts.length }));
      }
      return parts.length > 0
        ? t("link.linkedWithDetail", {
            name: r.display,
            detail: parts.join(t("link.listSeparator")),
          })
        : t("link.linked", { name: r.display });
    },
  },
  alreadyLinked: {
    kind: "success",
    render: (t, r) => t("link.alreadyLinked", { name: r.display }),
  },
  refused: {
    kind: "warning",
    render: (t, r) =>
      t("link.refused", {
        name: r.display,
        message: r.message ?? t("link.noReason"),
      }),
  },
  skipped: {
    kind: "success",
    render: (t, r) => t("link.skipped", { name: r.display }),
  },
  failed: {
    kind: "error",
    render: (t, r) =>
      t("link.failed", {
        name: r.display,
        message: r.message ?? t("common.unknownError"),
      }),
  },
  unlinked: {
    kind: "success",
    // Nothing is restored: skills adopted at link time stay in the canonical
    // dir (the settings dialog spells that out before the user commits).
    render: (t, r) => t("link.unlinked", { name: r.display }),
  },
  notLinked: {
    kind: "warning",
    render: (t, r) => t("link.notLinked", { name: r.display }),
  },
};

/** Link outcome → toast renderer and semantic color; unknown statuses return null (no toast). */
export function formatLinkMessage(
  result: AgentLinkResult | undefined,
): Notice | null {
  if (!result) return null;
  const entry = STATUS_NOTICES[result.status];
  return entry
    ? { kind: entry.kind, render: (t) => entry.render(t, result) }
    : null;
}
