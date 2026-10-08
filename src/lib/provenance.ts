/**
 * Skill One local configuration and provenance ledger (`~/.agents/skills/.skill-one.json`).
 *
 * Stores installed skill provenance (origin: store vs local, associated GitHub repo, tags)
 * and custom taxonomy definitions. Formatted as clean, human-readable JSON.
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

/** Parsed ledger structure (alias to SkillOneConfig). */
export type ParsedLedger = SkillOneConfig;

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
  emptyRepos: Set<string>;
}

export interface PendingRecord {
  kind: "pending";
  name: string;
  key?: string;
  fingerprint?: SkillFingerprint;
  candidates?: PersistedCandidate[];
  repos?: string[];
}

export interface PersistedCandidate {
  repo: string;
  similarity: number;
  stars: number;
  downloads: number;
  description: string;
  descriptionZh?: string;
  domain?: string[];
}

export interface StoredPending {
  index?: string;
  records: Record<string, PendingRecord>;
}

// ------------------------------------------------------------------- parsing & serialization

function emptyConfig(): SkillOneConfig {
  return { version: 1, skills: {}, customTags: [] };
}

/** Parse raw ledger content (`~/.agents/skills/.skill-one.json`). */
export function parseLedger(raw: string | null | undefined): SkillOneConfig {
  if (!raw) return emptyConfig();

  const trimmed = raw.trim();
  if (!trimmed) return emptyConfig();

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.skills &&
      typeof parsed.skills === "object"
    ) {
      return {
        version: 1,
        skills: parsed.skills as Record<string, SkillEntry>,
        customTags: Array.isArray(parsed.customTags)
          ? (parsed.customTags as CustomTagDef[])
          : [],
      };
    }
  } catch {
    // Malformed JSON: return empty ledger
  }

  return emptyConfig();
}


/** Serialize SkillOneConfig to indented JSON. */
export function serializeLedger(config: SkillOneConfig): string {
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
      tags: ["效率工具"],
    },
    "frontend-design": {
      origin: "store",
      repo: "shadcn/ui",
    },
    "mcp-builder": {
      origin: "store",
      repo: "modelcontextprotocol/servers",
    },
    "code-review": {
      origin: "local",
      repo: "google-deepmind/skills",
    },
    "react-query-helper": {
      origin: "local",
      repo: "tanstack/query",
    },
    "git-commit": {
      origin: "local",
      tags: ["开发辅助"],
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

async function loadLedger(): Promise<SkillOneConfig> {
  let raw = isTauri() ? await readProvenanceRaw() : storage.getItem(BROWSER_STORAGE_KEY);
  if (!isTauri() && !raw && import.meta.env.MODE !== "test" && !import.meta.env.VITEST) {
    storage.setItem(BROWSER_STORAGE_KEY, serializeLedger(DEFAULT_BROWSER_PREVIEW_LEDGER));
    raw = storage.getItem(BROWSER_STORAGE_KEY);
  }
  return parseLedger(raw);
}

async function saveLedger(config: SkillOneConfig): Promise<void> {
  const text = serializeLedger(config);
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
    const config = await loadLedger();
    const origin: "store" | "local" = reason === "install" ? "store" : "local";
    const existing = config.skills[name];
    const existingTags = existing?.tags ?? [];
    const newTags = defaultTags ?? [];
    const mergedTags = Array.from(new Set([...existingTags, ...newTags]));

    config.skills[name] = {
      origin,
      repo,
      ...(mergedTags.length > 0 ? { tags: mergedTags } : {}),
    };

    await saveLedger(config);
    if (repo) {
      await logSkillSourceLink(repo, name, reason);
    }
  } catch (e) {
    console.warn("provenance: failed to record install source", e);
  }
}

export async function recordSkillProvenanceBatch(
  entries: readonly {
    repo: string;
    name: string;
    reason?: SourceLinkReason;
    defaultTags?: readonly string[];
  }[],
): Promise<void> {
  try {
    const config = await loadLedger();
    for (const entry of entries) {
      const reason = entry.reason ?? "confirm";
      const origin: "store" | "local" = reason === "install" ? "store" : "local";
      const existing = config.skills[entry.name];
      const existingTags = existing?.tags ?? [];
      const newTags = entry.defaultTags ?? [];
      const mergedTags = Array.from(new Set([...existingTags, ...newTags]));

      config.skills[entry.name] = {
        origin,
        repo: entry.repo,
        ...(mergedTags.length > 0 ? { tags: mergedTags } : {}),
      };
    }
    await saveLedger(config);
    for (const entry of entries) {
      if (entry.repo) {
        await logSkillSourceLink(entry.repo, entry.name, entry.reason ?? "confirm");
      }
    }
  } catch (e) {
    console.warn("provenance: failed to record install sources", e);
  }
}

/**
 * Explicitly mark a skill as having an empty source repository (`repo: ""`).
 * This records the skill as an intentionally unlinked local skill, preventing
 * future suggestion passes from offering recommendations in the banner.
 */
export async function markSkillUnlinked(name: string): Promise<void> {
  await recordSkillProvenance("", name, "confirm");
}

export async function removeSkillProvenance(name: string): Promise<void> {
  try {
    const config = await loadLedger();
    delete config.skills[name];
    await saveLedger(config);
  } catch (e) {
    console.warn("provenance: failed to forget install source", e);
  }
}

export async function removeSkillProvenanceBatch(names: readonly string[]): Promise<void> {
  try {
    const config = await loadLedger();
    let changed = false;
    for (const name of names) {
      if (config.skills[name]) {
        delete config.skills[name];
        changed = true;
      }
    }
    if (changed) await saveLedger(config);
  } catch (e) {
    console.warn("provenance: failed to forget install sources", e);
  }
}

/** Unlink a skill's source repository while retaining its origin: local status and tags. */
export async function unlinkSkillSource(name: string, _repo?: string): Promise<void> {
  try {
    const config = await loadLedger();
    if (config.skills[name]) {
      delete config.skills[name].repo;
      config.skills[name].origin = "local";
      await saveLedger(config);
    }
  } catch (e) {
    console.warn("provenance: failed to unlink skill source", e);
  }
}

/**
 * Reconcile the ledger with the on-disk installed skills:
 * 1. Prunes records for removed skills.
 * 2. Ensures every installed skill has a record (defaulting to origin: "local").
 */
export async function reconcileProvenance(
  installedNames: readonly string[],
): Promise<ReconciledProvenance> {
  const config = await loadLedger();
  const installed = new Set(installedNames);
  let changed = false;

  // Prune removed skills
  for (const name of Object.keys(config.skills)) {
    if (!installed.has(name)) {
      delete config.skills[name];
      changed = true;
    }
  }

  // Ensure every on-disk skill has an entry
  for (const name of installedNames) {
    if (!config.skills[name]) {
      config.skills[name] = { origin: "local" };
      changed = true;
    }
  }

  if (changed) await saveLedger(config);

  const sources: Record<string, SkillProvenance> = {};
  const emptyRepos = new Set<string>();
  for (const [name, entry] of Object.entries(config.skills)) {
    if (entry.repo) {
      sources[name] = {
        origin: entry.origin,
        repo: entry.repo,
        tags: entry.tags,
        via: entry.origin === "store" ? "install" : "confirm",
      };
    } else if (entry.repo === "") {
      emptyRepos.add(name);
    }
  }

  return { sources, cut: {}, emptyRepos };
}

// ---------------------------------------------------- pending records & suggestions

export async function loadPendingRecords(): Promise<StoredPending> {
  const config = await loadLedger();
  const records: Record<string, PendingRecord> = {};
  for (const [name, entry] of Object.entries(config.skills)) {
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
  // Suggestions are derived in-memory and not stored as bloated cache.
}

// ------------------------------------------------------------- custom tags

export async function loadCustomTags(): Promise<CustomTags> {
  const config = await loadLedger();
  const tagDefs = (config.customTags ?? []).map(({ key, label }) => ({
    key,
    label,
  }));
  const skillTags: Record<string, string> = {};

  for (const [name, entry] of Object.entries(config.skills)) {
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
  const config = await loadLedger();
  config.customTags = config.customTags ?? [];
  const existing = config.customTags.find((t) => t.key === key);
  if (existing) {
    existing.label = label;
  } else {
    config.customTags.push({ key, label });
  }
  await saveLedger(config);
}

export async function deleteCustomTagDef(key: string): Promise<void> {
  const config = await loadLedger();
  if (config.customTags) {
    config.customTags = config.customTags.filter((t) => t.key !== key);
  }

  // Remove tag from skills
  for (const entry of Object.values(config.skills)) {
    if (entry.tags) {
      entry.tags = entry.tags.filter((t) => t !== key);
      if (entry.tags.length === 0) delete entry.tags;
    }
  }

  await saveLedger(config);
}

export async function renameCustomTagDef(
  oldKey: string,
  newKey: string,
  newLabel: string,
): Promise<void> {
  const config = await loadLedger();
  if (config.customTags) {
    const existing = config.customTags.find((t) => t.key === oldKey);
    if (existing) {
      existing.key = newKey;
      existing.label = newLabel;
    }
  }

  for (const entry of Object.values(config.skills)) {
    if (entry.tags) {
      entry.tags = entry.tags.map((t) => (t === oldKey ? newKey : t));
    }
  }

  await saveLedger(config);
}

export async function setSkillTags(name: string, tags: string[]): Promise<void> {
  const config = await loadLedger();
  const entry = config.skills[name] ?? { origin: "local" };
  entry.tags = tags.length > 0 ? tags : undefined;
  config.skills[name] = entry;
  await saveLedger(config);
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
  const config = await loadLedger();
  const list: readonly { name: string; tag: string | null }[] =
    typeof namesOrEntries[0] === "string"
      ? (namesOrEntries as readonly string[]).map((name) => ({
          name,
          tag: singleTag ?? null,
        }))
      : (namesOrEntries as readonly { name: string; tag: string | null }[]);

  for (const { name, tag } of list) {
    const entry = config.skills[name] ?? { origin: "local" };
    entry.tags = tag ? [tag] : undefined;
    config.skills[name] = entry;
  }
  await saveLedger(config);
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
    return [{ line: 1, broken: trimmed }];
  }
}

export async function revealProvenanceDir(): Promise<void> {
  if (isTauri()) await openProvenanceDirRaw();
}

// ------------------------------------------------- browser mock hooks (tests)

export function seedMockProvenance(
  entries: Record<
    string,
    { repo?: string; origin?: "store" | "local"; tags?: string[] }
  >,
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
      ...(e.repo ? { repo: e.repo } : {}),
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
  const config = parseLedger(existing);

  for (const def of defs) {
    if (!config.customTags) config.customTags = [];
    const idx = config.customTags.findIndex((t) => t.key === def.key);
    if (idx >= 0) config.customTags[idx] = { key: def.key, label: def.label };
    else config.customTags.push({ key: def.key, label: def.label });
  }

  for (const [name, tag] of Object.entries(assignments)) {
    const skill = config.skills[name] ?? { origin: "local" };
    skill.tags = [tag];
    config.skills[name] = skill;
  }

  storage.setItem(BROWSER_STORAGE_KEY, serializeLedger(config));
}

export function seedMockLedgerRaw(raw: string): void {
  if (isTauri()) return;
  storage.setItem(BROWSER_STORAGE_KEY, raw);
}
