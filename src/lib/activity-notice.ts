/**
 * The display side of the activity log: one entry per event type describing how
 * a record reads — its mark, its semantic colour, its one-line summary and its
 * optional detail line. Adding an event type is one entry here, exactly like
 * `link-notice.ts` does for link outcomes.
 *
 * Also the pure view helpers the viewer needs: which category an event belongs
 * to (for the filter chips), day grouping, and relative-time formatting.
 */

import type { ParseKeys, TFunction } from "i18next";
import {
  GitBranch,
  Link2,
  PackageMinus,
  PackagePlus,
  PencilLine,
  Radar,
  ToggleLeft,
  ToggleRight,
  Unlink,
  type LucideIcon,
} from "lucide-react";

import type { ActivityEventType, ActivityRecord } from "./activity";

/** The semantic colour a record's mark carries. */
export type ActivityTone = "default" | "success" | "danger";

/** How one event type presents. */
export interface ActivityNotice {
  icon: LucideIcon;
  tone: (record: ActivityRecord) => ActivityTone;
  /** The one-line summary. */
  summary: (t: TFunction, record: ActivityRecord) => string;
  /** The secondary line with the event's extra facts; null when it has none. */
  detail?: (t: TFunction, record: ActivityRecord) => string | null;
}

/** The first affected name (every event but a batch names exactly one). */
const firstName = (r: ActivityRecord): string => r.target.names[0] ?? "";

/** A detail field read defensively — the log tolerates hand-edited lines. */
const text = (value: unknown): string => (typeof value === "string" ? value : "");

const count = (value: unknown): number =>
  typeof value === "number" ? value : 0;

/** The i18n key naming where a discovered skill came from. */
function originKey(value: unknown): ParseKeys {
  return value === "store"
    ? "activity.origin.store"
    : "activity.origin.external";
}

/** The i18n key naming why a skill was associated with its source. */
function reasonKey(value: unknown): ParseKeys {
  switch (value) {
    case "description":
      return "activity.reason.description";
    case "confirm":
      return "activity.reason.confirm";
    default:
      return "activity.reason.install";
  }
}

const NOTICES: Record<ActivityEventType, ActivityNotice> = {
  "skill.install": {
    icon: PackagePlus,
    tone: () => "success",
    summary: (t, r) =>
      t("activity.summary.skillInstall", {
        name: firstName(r),
        repo: text(r.detail.repo),
      }),
  },
  "skill.remove": {
    icon: PackageMinus,
    tone: () => "danger",
    summary: (t, r) => {
      const names = r.target.names;
      return names.length === 1
        ? t("activity.summary.skillRemoveSingle", { name: names[0] })
        : t("activity.summary.skillRemove", { count: names.length });
    },
  },
  "skill.enable": {
    icon: ToggleRight,
    tone: () => "success",
    summary: (t, r) => {
      const names = r.target.names;
      return names.length === 1
        ? t("activity.summary.skillEnableSingle", { name: names[0] })
        : t("activity.summary.skillEnable", { count: names.length });
    },
  },
  "skill.disable": {
    icon: ToggleLeft,
    tone: () => "default",
    summary: (t, r) => {
      const names = r.target.names;
      return names.length === 1
        ? t("activity.summary.skillDisableSingle", { name: names[0] })
        : t("activity.summary.skillDisable", { count: names.length });
    },
  },
  "skill.edit": {
    icon: PencilLine,
    tone: () => "default",
    summary: (t, r) => t("activity.summary.skillEdit", { name: firstName(r) }),
  },
  "skill.discover": {
    icon: Radar,
    tone: () => "default",
    summary: (t, r) =>
      t("activity.summary.skillDiscover", { name: firstName(r) }),
    detail: (t, r) => t(originKey(r.detail.origin)),
  },
  "agent.link": {
    icon: Link2,
    tone: (r) => (r.result === "ok" ? "success" : "danger"),
    summary: (t, r) =>
      t(
        r.result === "ok"
          ? "activity.summary.agentLink"
          : "activity.summary.agentLinkFailed",
        { name: firstName(r) },
      ),
    detail: (t, r) => {
      if (r.result === "failed" && r.error) return r.error;
      const parts: string[] = [];
      const adopted = count(r.detail.adopted);
      const quarantined = count(r.detail.quarantined);
      const conflicts = count(r.detail.conflicts);
      if (adopted > 0) parts.push(t("link.adopted", { count: adopted }));
      if (quarantined > 0)
        parts.push(t("link.quarantined", { count: quarantined }));
      if (conflicts > 0) parts.push(t("link.conflicts", { count: conflicts }));
      return parts.length > 0 ? parts.join(t("link.listSeparator")) : null;
    },
  },
  "agent.unlink": {
    icon: Unlink,
    tone: (r) => (r.result === "ok" ? "default" : "danger"),
    summary: (t, r) =>
      t(
        r.result === "ok"
          ? "activity.summary.agentUnlink"
          : "activity.summary.agentUnlinkFailed",
        { name: firstName(r) },
      ),
    detail: (_t, r) => (r.result === "failed" ? r.error ?? null : null),
  },
  "source.link": {
    icon: GitBranch,
    tone: () => "default",
    summary: (t, r) =>
      t("activity.summary.sourceLink", {
        name: firstName(r),
        repo: text(r.detail.repo),
      }),
    detail: (t, r) => t(reasonKey(r.detail.reason)),
  },
};

/** The notice for an event type. */
export function activityNotice(event: ActivityEventType): ActivityNotice {
  return NOTICES[event];
}

/** The filter category an event belongs to. */
export type ActivityCategory = "skill" | "agent" | "source";

export function activityCategory(event: ActivityEventType): ActivityCategory {
  if (event === "agent.link" || event === "agent.unlink") return "agent";
  if (event === "source.link") return "source";
  return "skill";
}

/** One day's records, newest day first. */
export interface ActivityDayGroup {
  /** Local-midnight timestamp identifying the day. */
  day: number;
  records: ActivityRecord[];
}

export function startOfLocalDay(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Group records (already newest-first) into local days, preserving that order.
 * A record with an unparseable timestamp falls into the epoch group rather
 * than breaking the list.
 */
export function groupActivityByDay(
  records: readonly ActivityRecord[],
): ActivityDayGroup[] {
  const groups: ActivityDayGroup[] = [];
  let current: ActivityDayGroup | null = null;
  for (const record of records) {
    const parsed = Date.parse(record.ts);
    const day = Number.isNaN(parsed) ? 0 : startOfLocalDay(parsed);
    if (!current || current.day !== day) {
      current = { day, records: [] };
      groups.push(current);
    }
    current.records.push(record);
  }
  return groups;
}

const RELATIVE_UNITS: ReadonlyArray<{
  limit: number;
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}> = [
  { limit: 60_000, unit: "second", ms: 1_000 },
  { limit: 3_600_000, unit: "minute", ms: 60_000 },
  { limit: 86_400_000, unit: "hour", ms: 3_600_000 },
  { limit: 2_592_000_000, unit: "day", ms: 86_400_000 },
  { limit: 31_536_000_000, unit: "month", ms: 2_592_000_000 },
  { limit: Infinity, unit: "year", ms: 31_536_000_000 },
];

/**
 * A record's timestamp rendered relatively ("2 hours ago"), localized through
 * the platform's own `Intl.RelativeTimeFormat` — no dependency. An unparseable
 * timestamp yields an empty string.
 */
export function formatRelativeTime(
  ts: string,
  now: number = Date.now(),
  locale?: string,
): string {
  const then = Date.parse(ts);
  if (Number.isNaN(then)) return "";
  const diff = then - now;
  const abs = Math.abs(diff);
  const chosen =
    RELATIVE_UNITS.find((candidate) => abs < candidate.limit) ??
    RELATIVE_UNITS[RELATIVE_UNITS.length - 1];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(diff / chosen.ms),
    chosen.unit,
  );
}
