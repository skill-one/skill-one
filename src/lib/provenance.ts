/**
 * Skill One local configuration and provenance ledger (`~/.agents/skills/.skill-one.json`).
 *
 * Stores installed skill provenance (origin: store vs local, associated GitHub repo, tags)
 * and custom taxonomy definitions. Formatted as clean, human-readable JSON.
 *
 * Automatically migrates legacy `.skill-one.jsonl` files on first read.
 */

import { isTauri } from "./tauri";
import { storage } from "./storage";
import {
  openProvenanceDirRaw,
  readProvenanceRaw,
  writeProvenanceRaw,
} from "./skills-manager";
import type { SkillFingerprint } from "./skills-manager";
import { logActivity, type SourceLinkReason } from "./activity";

export type { SkillFingerprint };

/** Single skill entry in `.skill-one.json`. */
export interface SkillEntry {
  /** Installation origin: "store" (Skill One store) or "local" (third-party / manual). */
  origin: "store" | "local";
  /** The associated GitHub repository, as `owner/repo`. */
  repo?: string;
  /** Tags assigned to this skill (both official and custom). */
  tags?: string[];
}

/** User-defined taxonomy tag definition. */
export interface CustomTagDef {
  key: string;
  label: string;
}

/** Root schema of `.skill-one.json`. */
export interface SkillOneConfig {
  version: 1;
  skills: Record<string, SkillEntry>;
  customTags?: CustomTagDef[];
}

/**
 * Backward-compatible source record.
 */
export interface SourceRecord {
  kind: "source";
  name: string;
  repo: string;
  via?: SourceLinkReason;
}

/**
 * Backward-compatible candidate structure.
 */
export interface PersistedCandidate {
  repo: string;
  similarity: number;
  stars: number;
  downloads: number;
  description: string;
  descriptionZh?: string;
}

/**
 * Backward-compatible pending record.
 */
export interface PendingRecord {
  kind: "pending";
  name: string;
  key?: string;
  fingerprint?: SkillFingerprint;
  candidates?: PersistedCandidate[];
  repos?: string[];
}

export interface TagDefRecord {
  kind: "tag-def";
  key: string;
  label: string;
  emoji?: string;
}

export interface SkillTagRecord {
  kind: "skill-tag";
  name: string;
  tag: string;
}

export type LedgerRecord =
  | SourceRecord
  | PendingRecord
  | TagDefRecord
  | SkillTagRecord;

/** Parsed ledger structure consumed by legacy callers and internal state. */
export interface ParsedLedger {
  index?: string;
  records: Map<string, SourceRecord | PendingRecord>;
  tagDefs: Map<string, TagDefRecord>;
  skillTags: Map<string, string>;
  config: SkillOneConfig;
}

export interface SkillProvenance {
  origin: "store" | "local";
  repo: string;
  tags?: string[];
  via?: SourceLinkReason;
}

export interface CustomTags {
  tagDefs: Array<{ key: string; label: string; emoji?: string }>;
  skillTags: Record<string, string>;
  skillAllTags?: Record<string, string[]>;
}

export interface ReconciledProvenance {
  sources: Record<string, SkillProvenance>;
  cut: Record<string, string[]>;
}

export interface StoredPending {
  index?: string;
  records: Record<string, PendingRecord>;
}

// ------------------------------------------------------------------- parsing & migration

function emptyParsedLedger(): ParsedLedger {
  return {
    records: new Map(),
    tagDefs: new Map(),
    skillTags: new Map(),
    config: { version: 1, skills: {}, customTags: [] },
  };
}

/** Parse raw ledger content (supports both new JSON and legacy JSONL). */
export function parseLedger(raw: string | null | undefined): ParsedLedger {
  const ledger = emptyParsedLedger();
  if (!raw) return ledger;

  const trimmed = raw.trim();
  if (!trimmed) return ledger;

  // 1. Try parsing as new JSON config
  if (trimmed.startsWith("{") && !trimmed.includes('"kind":')) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (parsed && typeof parsed === "object" && parsed.skills && typeof parsed.skills === "object") {
        const skillsObj = parsed.skills as Record<string, SkillEntry>;
        const customTagsArr = Array.isArray(parsed.customTags)
          ? (parsed.customTags as CustomTagDef[])
          : [];

        ledger.config = {
          version: 1,
          skills: skillsObj,
          customTags: customTagsArr,
        };

        // Populate backward-compatible maps
        for (const [name, entry] of Object.entries(skillsObj)) {
          if (entry.repo) {
            ledger.records.set(name, {
              kind: "source",
              name,
              repo: entry.repo,
              via: entry.origin === "store" ? "install" : "confirm",
            });
          } else {
            ledger.records.set(name, { kind: "pending", name });
          }

          if (entry.tags && entry.tags.length > 0) {
            ledger.skillTags.set(name, entry.tags[0]);
          }
        }

        for (const tag of customTagsArr) {
          ledger.tagDefs.set(tag.key, {
            kind: "tag-def",
            key: tag.key,
            label: tag.label,
          });
        }

        return ledger;
      }
    } catch {
      // Fall through to JSONL parser
    }
  }

  // 2. Parse legacy JSONL lines
  for (const line of trimmed.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(l);
    } catch {
      continue;
    }
    if (typeof entry !== "object" || entry === null) continue;

    if (entry.kind === "meta") {
      if (typeof entry.index === "string" && entry.index.length > 0) {
        ledger.index = entry.index;
      }
      continue;
    }

    if (entry.kind === "tag-def") {
      if (typeof entry.key === "string" && typeof entry.label === "string") {
        const key = entry.key.trim();
        const label = entry.label.trim();
        if (key && label) {
          ledger.tagDefs.set(key, {
            kind: "tag-def",
            key,
            label,
            emoji: typeof entry.emoji === "string" ? entry.emoji : undefined,
          });
          ledger.config.customTags = ledger.config.customTags ?? [];
          if (!ledger.config.customTags.some((t) => t.key === key)) {
            ledger.config.customTags.push({ key, label });
          }
        }
      }
      continue;
    }

    if (entry.kind === "skill-tag") {
      if (typeof entry.name === "string" && typeof entry.tag === "string") {
        const name = entry.name.trim();
        const tag = entry.tag.trim();
        if (name && tag) {
          ledger.skillTags.set(name, tag);
          const skill = ledger.config.skills[name] ?? { origin: "local" };
          skill.tags = [tag];
          ledger.config.skills[name] = skill;
        } else if (name && !tag) {
          ledger.skillTags.delete(name);
          if (ledger.config.skills[name]) {
            delete ledger.config.skills[name].tags;
          }
        }
      }
      continue;
    }

    if (typeof entry.name !== "string" || !entry.name) continue;
    const name = entry.name.trim();

    if (entry.kind === "source" && typeof entry.repo === "string" && entry.repo) {
      const origin: "store" | "local" = entry.via === "install" ? "store" : "local";
      const via: SourceLinkReason | undefined =
        entry.via === "install" || entry.via === "confirm" || entry.via === "description"
          ? (entry.via as SourceLinkReason)
          : undefined;

      ledger.records.set(name, {
        kind: "source",
        name,
        repo: entry.repo,
        via,
      });

      const skill = ledger.config.skills[name] ?? { origin };
      skill.origin = origin;
      skill.repo = entry.repo;
      ledger.config.skills[name] = skill;
    } else if (entry.kind === "pending") {
      const pending: PendingRecord = { kind: "pending", name };
      if (Array.isArray(entry.repos)) {
        pending.repos = entry.repos.filter((r): r is string => typeof r === "string");
      }
      if (Array.isArray(entry.candidates)) {
        pending.candidates = entry.candidates.filter(
          (c): c is PersistedCandidate => typeof c === "object" && c !== null && typeof c.repo === "string",
        );
      }
      ledger.records.set(name, pending);

      if (!ledger.config.skills[name]) {
        ledger.config.skills[name] = { origin: "local" };
      }
    }
  }

  return ledger;
}

/** Serialize to indented JSON. Supports both new config object and legacy arguments. */
export function serializeLedger(
  configOrIndex?: SkillOneConfig | string,
  records?: Iterable<LedgerRecord>,
  tagDefs?: Iterable<TagDefRecord>,
  skillTags?: Iterable<readonly [string, string]>,
): string {
  if (configOrIndex && typeof configOrIndex === "object" && "version" in configOrIndex) {
    return `${JSON.stringify(configOrIndex, null, 2)}\n`;
  }

  // Construct from legacy parameters
  const config: SkillOneConfig = {
    version: 1,
    skills: {},
    customTags: [],
  };

  if (records) {
    for (const record of records) {
      if (record.kind === "source") {
        config.skills[record.name] = {
          origin: record.via === "install" ? "store" : "local",
          repo: record.repo,
        };
      } else if (record.kind === "pending") {
        if (!config.skills[record.name]) {
          config.skills[record.name] = { origin: "local" };
        }
      }
    }
  }

  if (tagDefs) {
    for (const def of tagDefs) {
      config.customTags?.push({ key: def.key, label: def.label });
    }
  }

  if (skillTags) {
    for (const [name, tag] of skillTags) {
      if (tag) {
        const skill = config.skills[name] ?? { origin: "local" };
        skill.tags = [tag];
        config.skills[name] = skill;
      }
    }
  }

  return `${JSON.stringify(config, null, 2)}\n`;
}

// --------------------------------------------------------------- persistence

const BROWSER_STORAGE_KEY = "skill-one.provenance";

export const DEFAULT_BROWSER_PREVIEW_LEDGER: SkillOneConfig = {
  version: 1,
  skills: {
    pdf: {
      origin: "store",
      repo: "anthropics/skills",
      tags: ["documents", "效率工具"],
    },
    "frontend-design": {
      origin: "store",
      repo: "shadcn/ui",
      tags: ["frontend", "界面开发"],
    },
    "mcp-builder": {
      origin: "store",
      repo: "modelcontextprotocol/servers",
      tags: ["mcp", "开发辅助"],
    },
    "code-review": {
      origin: "local",
      repo: "google-deepmind/skills",
      tags: ["code-review", "AI Agent"],
    },
    "react-query-helper": {
      origin: "local",
      repo: "tanstack/query",
      tags: ["frontend"],
    },
    "git-commit": {
      origin: "local",
      tags: ["效率工具", "开发辅助"],
    },
    "dingtalk-doc": {
      origin: "local",
      tags: ["办公写作"],
    },
    "微信读书助手": {
      origin: "local",
      tags: ["阅读学习"],
    },
    "🤖-auto-agent": {
      origin: "local",
      tags: ["AI Agent"],
    },
    "legacy-data-cleaner": {
      origin: "local",
    },
  },
  customTags: [
    { key: "效率工具", label: "效率工具" },
    { key: "AI Agent", label: "AI Agent" },
    { key: "开发辅助", label: "开发辅助" },
    { key: "办公写作", label: "办公写作" },
    { key: "阅读学习", label: "阅读学习" },
    { key: "界面开发", label: "界面开发" },
  ],
};

async function loadLedger(): Promise<ParsedLedger> {
  let raw = isTauri() ? await readProvenanceRaw() : storage.getItem(BROWSER_STORAGE_KEY);
  if (!isTauri() && !raw && import.meta.env.MODE !== "test" && !import.meta.env.VITEST) {
    storage.setItem(BROWSER_STORAGE_KEY, serializeLedger(DEFAULT_BROWSER_PREVIEW_LEDGER));
    raw = storage.getItem(BROWSER_STORAGE_KEY);
  }
  return parseLedger(raw);
}

async function saveLedger(ledger: ParsedLedger): Promise<void> {
  const text = serializeLedger(ledger.config);
  if (isTauri()) {
    await writeProvenanceRaw(text);
    return;
  }
  storage.setItem(BROWSER_STORAGE_KEY, text);
}

async function logSkillSourceLink(
  repo: string,
  name: string,
  reason: SourceLinkReason,
): Promise<void> {
  await logActivity({
    event: "source.link",
    actor: reason === "description" ? "auto" : "user",
    kind: "skill",
    names: [name],
    detail: { repo, reason },
  });
}

/**
 * Record a skill's provenance.
 * - If reason === "install", marked as origin: "store".
 * - If reason === "confirm" | "description", marked as origin: "local".
 * - If defaultTags are provided, merges them into tags.
 */
export async function recordSkillProvenance(
  repo: string,
  name: string,
  reason: SourceLinkReason = "install",
  defaultTags?: readonly string[],
): Promise<void> {
  try {
    const ledger = await loadLedger();
    const origin: "store" | "local" = reason === "install" ? "store" : "local";
    const existing = ledger.config.skills[name];
    const tags =
      defaultTags && defaultTags.length > 0 && (!existing?.tags || existing.tags.length === 0)
        ? [...defaultTags]
        : existing?.tags;

    ledger.config.skills[name] = {
      origin,
      repo,
      ...(tags && tags.length > 0 ? { tags } : {}),
    };
    ledger.records.set(name, { kind: "source", name, repo, via: reason });

    await saveLedger(ledger);
    await logSkillSourceLink(repo, name, reason);
  } catch (e) {
    console.warn("provenance: failed to record install source", e);
  }
}

export async function recordSkillProvenanceBatch(
  entries: readonly {
    repo: string;
    name: string;
    reason: SourceLinkReason;
    defaultTags?: readonly string[];
  }[],
): Promise<void> {
  try {
    const ledger = await loadLedger();
    for (const entry of entries) {
      const origin: "store" | "local" = entry.reason === "install" ? "store" : "local";
      const existing = ledger.config.skills[entry.name];
      const tags =
        entry.defaultTags &&
        entry.defaultTags.length > 0 &&
        (!existing?.tags || existing.tags.length === 0)
          ? [...entry.defaultTags]
          : existing?.tags;

      ledger.config.skills[entry.name] = {
        origin,
        repo: entry.repo,
        ...(tags && tags.length > 0 ? { tags } : {}),
      };
      ledger.records.set(entry.name, {
        kind: "source",
        name: entry.name,
        repo: entry.repo,
        via: entry.reason,
      });
    }
    await saveLedger(ledger);
    for (const entry of entries) {
      await logSkillSourceLink(entry.repo, entry.name, entry.reason);
    }
  } catch (e) {
    console.warn("provenance: failed to record install sources", e);
  }
}

export async function removeSkillProvenance(name: string): Promise<void> {
  try {
    const ledger = await loadLedger();
    delete ledger.config.skills[name];
    ledger.records.delete(name);
    ledger.skillTags.delete(name);
    await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to forget install source", e);
  }
}

export async function removeSkillProvenanceBatch(names: readonly string[]): Promise<void> {
  try {
    const ledger = await loadLedger();
    let changed = false;
    for (const name of names) {
      if (ledger.config.skills[name]) {
        delete ledger.config.skills[name];
        changed = true;
      }
      ledger.records.delete(name);
      ledger.skillTags.delete(name);
    }
    if (changed) await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to forget install sources", e);
  }
}

/** Unlink a skill's source repository while retaining its origin: local status and tags. */
export async function unlinkSkillSource(name: string, _repo?: string): Promise<void> {
  try {
    const ledger = await loadLedger();
    if (ledger.config.skills[name]) {
      delete ledger.config.skills[name].repo;
      ledger.config.skills[name].origin = "local";
      ledger.records.set(name, { kind: "pending", name });
      await saveLedger(ledger);
    }
  } catch (e) {
    console.warn("provenance: failed to unlink skill source", e);
  }
}

/** Backward-compatible alias for unlinking a source. */
export async function dismissSkillSource(name: string, repo: string): Promise<void> {
  await unlinkSkillSource(name, repo);
}

/**
 * Reconcile the ledger with the on-disk installed skills:
 * 1. Prunes records for removed skills.
 * 2. Ensures every installed skill has a record (defaulting to origin: "local").
 */
export async function reconcileProvenance(
  installedNames: readonly string[],
): Promise<ReconciledProvenance> {
  const ledger = await loadLedger();
  const installed = new Set(installedNames);
  let changed = false;

  // Prune removed skills
  for (const name of Object.keys(ledger.config.skills)) {
    if (!installed.has(name)) {
      delete ledger.config.skills[name];
      ledger.records.delete(name);
      ledger.skillTags.delete(name);
      changed = true;
    }
  }

  // Ensure every on-disk skill has an entry
  for (const name of installedNames) {
    if (!ledger.config.skills[name]) {
      ledger.config.skills[name] = { origin: "local" };
      ledger.records.set(name, { kind: "pending", name });
      changed = true;
    }
  }

  if (changed) await saveLedger(ledger);

  const sources: Record<string, SkillProvenance> = {};
  for (const [name, entry] of Object.entries(ledger.config.skills)) {
    if (entry.repo) {
      sources[name] = {
        origin: entry.origin,
        repo: entry.repo,
        tags: entry.tags,
        via: entry.origin === "store" ? "install" : "confirm",
      };
    }
  }

  return { sources, cut: {} };
}

// ---------------------------------------------------- pending records & suggestions

export async function loadPendingRecords(): Promise<StoredPending> {
  const ledger = await loadLedger();
  const records: Record<string, PendingRecord> = {};
  for (const [name, entry] of Object.entries(ledger.config.skills)) {
    if (!entry.repo) {
      records[name] = { kind: "pending", name };
    }
  }
  return { records };
}

export async function savePendingRecords(
  _upserts: readonly PendingRecord[],
  _drops: readonly string[],
  _index: string | undefined,
): Promise<void> {
  // In the new architecture, suggestions are derived in-memory and not stored as bloated cache.
}

// ------------------------------------------------------------- custom tags

export async function loadCustomTags(): Promise<CustomTags> {
  const ledger = await loadLedger();
  const tagDefs = (ledger.config.customTags ?? []).map(({ key, label }) => ({
    key,
    label,
  }));
  const skillTags: Record<string, string> = {};

  for (const [name, entry] of Object.entries(ledger.config.skills)) {
    if (entry.tags && entry.tags.length > 0) {
      skillTags[name] = entry.tags[0];
    }
  }

  return { tagDefs, skillTags };
}

export async function saveCustomTagDef(
  key: string,
  label: string,
  _emoji?: string,
): Promise<void> {
  const ledger = await loadLedger();
  ledger.config.customTags = ledger.config.customTags ?? [];
  const existing = ledger.config.customTags.find((t) => t.key === key);
  if (existing) {
    existing.label = label;
  } else {
    ledger.config.customTags.push({ key, label });
  }
  ledger.tagDefs.set(key, { kind: "tag-def", key, label });
  await saveLedger(ledger);
}

export async function deleteCustomTagDef(key: string): Promise<void> {
  const ledger = await loadLedger();
  if (ledger.config.customTags) {
    ledger.config.customTags = ledger.config.customTags.filter((t) => t.key !== key);
  }
  ledger.tagDefs.delete(key);

  // Remove tag from skills
  for (const [name, entry] of Object.entries(ledger.config.skills)) {
    if (entry.tags) {
      entry.tags = entry.tags.filter((t) => t !== key);
      if (entry.tags.length === 0) delete entry.tags;
    }
    if (ledger.skillTags.get(name) === key) {
      ledger.skillTags.delete(name);
    }
  }

  await saveLedger(ledger);
}

export async function renameCustomTagDef(
  oldKey: string,
  newKey: string,
  newLabel: string,
): Promise<void> {
  const ledger = await loadLedger();
  if (ledger.config.customTags) {
    const existing = ledger.config.customTags.find((t) => t.key === oldKey);
    if (existing) {
      existing.key = newKey;
      existing.label = newLabel;
    }
  }

  for (const [name, entry] of Object.entries(ledger.config.skills)) {
    if (entry.tags) {
      entry.tags = entry.tags.map((t) => (t === oldKey ? newKey : t));
    }
    if (ledger.skillTags.get(name) === oldKey) {
      ledger.skillTags.set(name, newKey);
    }
  }

  await saveLedger(ledger);
}

export async function setSkillTags(name: string, tags: string[]): Promise<void> {
  const ledger = await loadLedger();
  const entry = ledger.config.skills[name] ?? { origin: "local" };
  entry.tags = tags.length > 0 ? tags : undefined;
  ledger.config.skills[name] = entry;

  if (tags.length > 0) {
    ledger.skillTags.set(name, tags[0]);
  } else {
    ledger.skillTags.delete(name);
  }

  await saveLedger(ledger);
}

export async function setSkillTag(name: string, tag: string | null): Promise<void> {
  await setSkillTags(name, tag ? [tag] : []);
}

export async function setManySkillTags(
  namesOrEntries:
    | readonly string[]
    | readonly { name: string; tag: string | null }[],
  singleTag?: string | null,
): Promise<void> {
  const ledger = await loadLedger();
  const list: readonly { name: string; tag: string | null }[] =
    typeof namesOrEntries[0] === "string"
      ? (namesOrEntries as readonly string[]).map((name) => ({
          name,
          tag: singleTag ?? null,
        }))
      : (namesOrEntries as readonly { name: string; tag: string | null }[]);

  for (const { name, tag } of list) {
    const entry = ledger.config.skills[name] ?? { origin: "local" };
    entry.tags = tag ? [tag] : undefined;
    ledger.config.skills[name] = entry;
    if (tag) {
      ledger.skillTags.set(name, tag);
    } else {
      ledger.skillTags.delete(name);
    }
  }
  await saveLedger(ledger);
}

// ------------------------------------------------------------- developer view

export async function readLedgerRaw(): Promise<string | null> {
  return isTauri() ? readProvenanceRaw() : storage.getItem(BROWSER_STORAGE_KEY);
}

export interface LedgerLine {
  line: number;
  record?: Record<string, unknown>;
  text?: string;
  broken?: string;
}

export function ledgerLines(raw: string | null | undefined): LedgerLine[] {
  if (!raw || !raw.trim()) return [];
  const trimmed = raw.trim();

  // If JSON config, present as clean structured cards
  if (trimmed.startsWith("{") && !trimmed.includes('"kind":')) {
    try {
      const config = JSON.parse(trimmed) as SkillOneConfig;
      const lines: LedgerLine[] = [];
      let lineNum = 1;
      lines.push({ line: lineNum++, record: { kind: "meta", version: config.version } });
      for (const [name, entry] of Object.entries(config.skills || {})) {
        lines.push({
          line: lineNum++,
          record: {
            kind: entry.repo ? "source" : "pending",
            name,
            origin: entry.origin,
            repo: entry.repo,
            tags: entry.tags,
            via: entry.origin === "store" ? "install" : entry.repo ? "confirm" : undefined,
          },
        });
      }
      for (const tag of config.customTags || []) {
        lines.push({
          line: lineNum++,
          record: {
            kind: "tag-def",
            key: tag.key,
            label: tag.label,
          },
        });
      }
      return lines;
    } catch {
      // Fall through to line-by-line
    }
  }

  // Fallback line-by-line parser
  const lines: LedgerLine[] = [];
  let lineNumber = 0;
  for (const line of raw.split("\n")) {
    lineNumber += 1;
    const t = line.trim();
    if (!t) continue;
    try {
      lines.push({ line: lineNumber, record: JSON.parse(t) });
    } catch {
      lines.push({ line: lineNumber, broken: t });
    }
  }
  return lines;
}

export async function revealProvenanceDir(): Promise<void> {
  if (isTauri()) await openProvenanceDirRaw();
}

// ------------------------------------------------- browser mock hooks (tests)

export function seedMockProvenance(
  entries: Record<string, { repo: string; origin?: "store" | "local"; tags?: string[] }>,
): void {
  if (isTauri()) return;
  const config: SkillOneConfig = {
    version: 1,
    skills: {},
    customTags: [],
  };
  for (const [name, e] of Object.entries(entries)) {
    config.skills[name] = {
      origin: e.origin ?? "store",
      repo: e.repo,
      tags: e.tags,
    };
  }
  storage.setItem(BROWSER_STORAGE_KEY, serializeLedger(config));
}

export function resetMockProvenance(): void {
  if (isTauri()) return;
  storage.removeItem(BROWSER_STORAGE_KEY);
}

export function seedMockCustomTags(
  defs: readonly { key: string; label: string; emoji?: string }[] = [],
  assignments: Record<string, string> = {},
): void {
  if (isTauri()) return;
  const existing = storage.getItem(BROWSER_STORAGE_KEY);
  const parsed = parseLedger(existing);

  for (const def of defs) {
    if (!parsed.config.customTags) parsed.config.customTags = [];
    const idx = parsed.config.customTags.findIndex((t) => t.key === def.key);
    if (idx >= 0) parsed.config.customTags[idx] = { key: def.key, label: def.label };
    else parsed.config.customTags.push({ key: def.key, label: def.label });
  }

  for (const [name, tag] of Object.entries(assignments)) {
    const skill = parsed.config.skills[name] ?? { origin: "local" };
    skill.tags = [tag];
    parsed.config.skills[name] = skill;
  }

  storage.setItem(BROWSER_STORAGE_KEY, serializeLedger(parsed.config));
}

export function seedMockLedgerRaw(raw: string): void {
  if (isTauri()) return;
  storage.setItem(BROWSER_STORAGE_KEY, raw);
}
