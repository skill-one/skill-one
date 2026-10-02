/**
 * Activity log: the app's append-only record of impactful operations — what it
 * did to the user's skills and agents, and why. Stored as JSONL in the OS log
 * directory (`<app_log_dir>/activity.jsonl`; on macOS
 * `~/Library/Logs/com.skill-one.app/`).
 *
 * This is deliberately NOT the provenance ledger (`lib/provenance.ts`): that
 * file is a last-wins state snapshot keyed by skill name ("where does each
 * skill come from now?"), while this one is an event stream ("what happened?").
 * Every line is one operation, order matters, and nothing is ever overwritten.
 * The backend stays thin (`src-tauri/src/activity.rs`: append / tail / rotate /
 * clear / open); the schema and the tolerance policy live here.
 *
 * Recording is best-effort by contract — a log write failure is swallowed so it
 * can never fail (or slow down) the operation it documents, exactly like the
 * provenance ledger. Tolerance is per line: a broken line is skipped, the rest
 * of the log survives.
 *
 * What is recorded (see `activity-notice.ts` for the display side), and the
 * `detail` each event carries:
 *
 * - `skill.install`  { repo, skipped }                  — a store install
 * - `skill.remove`   { count }                          — uninstall(s)
 * - `skill.enable`   { count } / `skill.disable` {count} — enablement flip(s)
 * - `skill.edit`     {}                                 — SKILL.md saved
 * - `skill.discover` { origin: "store" | "external" }   — a skill first seen
 * - `agent.link`     { status, adopted, quarantined, conflicts }
 * - `agent.unlink`   { status }
 * - `source.link`    { repo, reason }                   — provenance association
 */

import { isTauri } from "./tauri";
import { storage } from "./storage";
import {
  appendActivityRaw,
  clearActivityRaw,
  openActivityDirRaw,
  readActivityRaw,
} from "./skills-manager";

/** Who performed the action: the user, an automatic pass, or a scan. */
export type ActivityActor = "user" | "auto" | "scan";

/** What the action acted on. */
export type ActivityTargetKind = "skill" | "agent";

/** The outcome of the action. */
export type ActivityResult = "ok" | "failed";

/** Why a skill was associated with a store source. */
export type SourceLinkReason = "install" | "description" | "confirm";

/** The event types the app records. */
export type ActivityEventType =
  | "skill.install"
  | "skill.remove"
  | "skill.enable"
  | "skill.disable"
  | "skill.edit"
  | "skill.discover"
  | "agent.link"
  | "agent.unlink"
  | "source.link";

const EVENT_TYPES: readonly ActivityEventType[] = [
  "skill.install",
  "skill.remove",
  "skill.enable",
  "skill.disable",
  "skill.edit",
  "skill.discover",
  "agent.link",
  "agent.unlink",
  "source.link",
];

const ACTORS: readonly ActivityActor[] = ["user", "auto", "scan"];

/** The names an action covered. One for a single subject, many for a batch. */
export interface ActivityTarget {
  kind: ActivityTargetKind;
  names: string[];
}

/** One stored event, as serialized to JSONL. */
export interface ActivityRecord {
  /** When it happened (ISO 8601 UTC). */
  ts: string;
  event: ActivityEventType;
  actor: ActivityActor;
  target: ActivityTarget;
  /** Event-specific facts; always present, `{}` when the event carries none. */
  detail: Record<string, unknown>;
  result: ActivityResult;
  /** The failure reason, present only when `result` is `failed`. */
  error?: string;
}

/** What a caller hands `logActivity`: the timestamp is stamped on write. */
export interface ActivityInput {
  event: ActivityEventType;
  actor: ActivityActor;
  kind: ActivityTargetKind;
  /** Affected names, in the order the action covered them. */
  names: string[];
  detail?: Record<string, unknown>;
  result?: ActivityResult;
  error?: string;
}

/** How many of the newest records the viewer reads by default. */
export const DEFAULT_ACTIVITY_LIMIT = 500;

// ------------------------------------------------------------------- parsing

function isEventType(value: unknown): value is ActivityEventType {
  return (
    typeof value === "string" &&
    (EVENT_TYPES as readonly string[]).includes(value)
  );
}

function isActor(value: unknown): value is ActivityActor {
  return (
    typeof value === "string" && (ACTORS as readonly string[]).includes(value)
  );
}

function toTarget(value: unknown): ActivityTarget | null {
  if (typeof value !== "object" || value === null) return null;
  const t = value as Record<string, unknown>;
  if (t.kind !== "skill" && t.kind !== "agent") return null;
  if (!Array.isArray(t.names)) return null;
  const names = t.names.filter((n): n is string => typeof n === "string");
  if (names.length === 0) return null;
  return { kind: t.kind, names };
}

/** Parse one stored line into a record; null when invalid. */
export function parseActivityLine(line: string): ActivityRecord | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (typeof r.ts !== "string" || !isEventType(r.event) || !isActor(r.actor)) {
    return null;
  }
  const target = toTarget(r.target);
  if (!target) return null;
  const record: ActivityRecord = {
    ts: r.ts,
    event: r.event,
    actor: r.actor,
    target,
    detail:
      typeof r.detail === "object" && r.detail !== null
        ? (r.detail as Record<string, unknown>)
        : {},
    result: r.result === "failed" ? "failed" : "ok",
  };
  if (typeof r.error === "string") record.error = r.error;
  return record;
}

/**
 * Parse raw log lines into records, newest first (the viewer's order),
 * tolerating a broken line by skipping it. `limit` caps the returned count.
 */
export function parseActivityLines(
  lines: readonly string[],
  limit: number = DEFAULT_ACTIVITY_LIMIT,
): ActivityRecord[] {
  const records: ActivityRecord[] = [];
  for (const line of lines) {
    const record = parseActivityLine(line);
    if (record) records.push(record);
  }
  records.reverse();
  return limit >= 0 ? records.slice(0, limit) : records;
}

// ------------------------------------------------------------------- reading

/**
 * The newest activity records, newest first. Best-effort: a backend failure
 * degrades to an empty list rather than a broken viewer, the same way the
 * provenance ledger degrades to name-only matching.
 */
export async function readActivity(
  limit: number = DEFAULT_ACTIVITY_LIMIT,
): Promise<ActivityRecord[]> {
  try {
    const lines = isTauri() ? await readActivityRaw(limit) : readMockLines();
    return parseActivityLines(lines, limit);
  } catch (e) {
    console.warn("activity: failed to read log", e);
    return [];
  }
}

// ------------------------------------------------------------------- writing

/**
 * Skill names the app has already accounted for, persisted so a discovery
 * pass reports only genuinely new arrivals. `null` until this install has
 * built a baseline (the very first reconcile adopts the current set).
 */
let seen: Set<string> | null = null;

/** Load the acknowledged-name set; null when this install never built one. */
function loadSeen(): Set<string> | null {
  if (seen) return seen;
  const raw = storage.getItem(SEEN_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      seen = new Set(
        parsed.filter((name): name is string => typeof name === "string"),
      );
      return seen;
    }
  } catch {
    // Unreadable: treat as "never built", so the next pass rebuilds it.
  }
  return null;
}

function persistSeen(next: Set<string>): void {
  seen = next;
  storage.setItem(SEEN_STORAGE_KEY, JSON.stringify([...next]));
}

/** Note skill names as accounted for; a no-op before the baseline exists. */
function addSeen(names: readonly string[]): void {
  if (!seen) return;
  for (const name of names) seen.add(name);
  persistSeen(seen);
}

/**
 * Append one activity record. Best-effort and safe to ignore: the promise
 * resolves even when the write fails, so a caller can `await` it for ordering
 * without risking the operation it documents.
 */
export async function logActivity(input: ActivityInput): Promise<void> {
  const record: ActivityRecord = {
    ts: new Date().toISOString(),
    event: input.event,
    actor: input.actor,
    target: { kind: input.kind, names: [...input.names] },
    detail: input.detail ?? {},
    result: input.result ?? "ok",
    ...(input.error ? { error: input.error } : {}),
  };
  // Keep the discovery memory current, but only once a baseline exists —
  // before that, the baseline pass adopts this name from the installed list.
  if (input.kind === "skill") addSeen(input.names);
  try {
    if (isTauri()) {
      await appendActivityRaw(JSON.stringify(record));
    } else {
      appendMockLine(JSON.stringify(record));
    }
  } catch (e) {
    console.warn("activity: failed to record event", e);
  }
}

/**
 * Report skills the app has never accounted for — the "scan" events. Called
 * whenever the installed list reconciles. The first call adopts the current
 * installed set as the baseline *without* logging: a new install of this app
 * must not report every pre-existing skill as newly discovered. Only later
 * arrivals are logged, once each, with `origin` `store` (the ledger vouches
 * for a source) or `external` (a tool install or a manual copy). A store
 * install already logs `skill.install`, so it is never double-counted.
 */
export async function logSkillDiscoveries(
  installed: readonly string[],
  isStoreLinked: (name: string) => boolean,
): Promise<void> {
  const known = loadSeen();
  if (known === null) {
    persistSeen(new Set(installed));
    return;
  }
  const fresh = installed.filter((name) => !known.has(name));
  if (fresh.length === 0) return;
  for (const name of fresh) {
    known.add(name);
    await logActivity({
      event: "skill.discover",
      actor: "scan",
      kind: "skill",
      names: [name],
      detail: { origin: isStoreLinked(name) ? "store" : "external" },
    });
  }
  persistSeen(known);
}

/** Delete the whole log (the viewer's 清空 action). Best-effort. */
export async function clearActivity(): Promise<void> {
  seen = null;
  try {
    if (isTauri()) {
      await clearActivityRaw();
    } else {
      storage.removeItem(BROWSER_STORAGE_KEY);
    }
  } catch (e) {
    console.warn("activity: failed to clear log", e);
  }
  // Forget the baseline too: the log it was derived from is gone, and the next
  // reconcile rebuilds it silently (rather than reporting every skill as new).
  storage.removeItem(SEEN_STORAGE_KEY);
}

/**
 * Reveal the log file's directory in the system file manager. A no-op in the
 * browser, where there is no file to reveal.
 */
export async function revealActivityLog(): Promise<void> {
  if (isTauri()) await openActivityDirRaw();
}

// ------------------------------------------------------- browser mock (tests)

/** Storage key holding the mock log in the browser (dev server / tests). */
const BROWSER_STORAGE_KEY = "skill-one.activity";
/** Storage key holding the acknowledged-name baseline. */
const SEEN_STORAGE_KEY = "skill-one.activity.seen";
/** The mock keeps the same bounded size as the real rotated file. */
const MOCK_LIMIT = DEFAULT_ACTIVITY_LIMIT;

function readMockLines(): string[] {
  const raw = storage.getItem(BROWSER_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((line): line is string => typeof line === "string")
      : [];
  } catch {
    // Unreadable: behave like an empty log.
    return [];
  }
}

function appendMockLine(line: string): void {
  const lines = readMockLines();
  lines.push(line);
  storage.setItem(
    BROWSER_STORAGE_KEY,
    JSON.stringify(lines.slice(-MOCK_LIMIT)),
  );
}

/**
 * Seed the browser log directly (dev server demos, tests). No-op inside Tauri,
 * where the real file is the only source of truth.
 */
export function seedMockActivity(records: readonly ActivityRecord[]): void {
  if (isTauri()) return;
  seen = null;
  storage.setItem(
    BROWSER_STORAGE_KEY,
    JSON.stringify(records.map((record) => JSON.stringify(record))),
  );
}

/** Clear the browser log and the discovery baseline (test reset). */
export function resetMockActivity(): void {
  seen = null;
  storage.removeItem(SEEN_STORAGE_KEY);
  if (isTauri()) return;
  storage.removeItem(BROWSER_STORAGE_KEY);
}
