/**
 * Provenance ledger: the app's own record of what it knows about each
 * installed skill, stored as `.skill-one.jsonl` inside the global skills
 * directory (`~/.agents/skills`) — one JSON line per skill, last one wins.
 *
 * Two kinds of knowledge share the file, discriminated by the record's own
 * fields (there is no kind tag; `repo` is the discriminator):
 *
 * - **Source** (`repo` present): where the skill came from — recorded at
 *   install time, on a confirmed or auto link, or by hash auto-association.
 *   `agents-skills` 0.13 dropped its lockfile; this restores the
 *   store↔install association at the app level.
 * - **Resolution** (`repo` absent): the cached outcome of failed source
 *   matching for skills installed by other tools — the namesake verdict
 *   against registry snapshot `epoch`, the computed content `hash` with the
 *   `fingerprint` that says when it is still valid, and the ranked
 *   `candidates` awaiting user confirmation. Persisting these keeps an app
 *   restart from re-walking and re-hashing every unlinked skill directory.
 *
 * The file is a hidden dotfile without a SKILL.md, so the agents-skills
 * directory scan ignores it and it never shows up as a skill. It is
 * best-effort on both ends: install/remove never fail because the ledger
 * could not be written, and a missing or corrupt file degrades to the
 * pre-ledger behavior (name-only matching). Tolerance is per line — a broken
 * line is skipped, the rest of the ledger survives. The pre-JSONL format (a
 * single JSON document) is read transparently for migration.
 */

import { isTauri } from "./tauri";
import { storage } from "./storage";
import { readProvenanceRaw, writeProvenanceRaw } from "./skills-manager";
import { logActivity, type SourceLinkReason } from "./activity";

/** A stored source record: one installed skill's store identity. */
export interface ProvenanceRecord {
  /** The skill's name — the directory name, unique in the global directory. */
  name: string;
  /** The GitHub repo the skill was installed from, as `owner/repo`. */
  repo: string;
  /** When the skill was installed (ISO 8601). Rewritten on reinstalls. */
  installedAt?: string;
  /**
   * The local content hash recorded when the association was made (the hash
   * the reconcile pass computed for the installed directory). A version
   * marker for ledger bookkeeping, NOT a description of the local files —
   * local edits are invisible to it, by design.
   */
  hash?: string;
}

/** Stat-only change-detection identity of a skill directory. */
export interface SkillFingerprint {
  /** Latest file mtime in the directory, as Unix milliseconds. */
  mtimeMs: number;
  /** Total size in bytes of the directory's files. */
  size: number;
}

/**
 * A stored candidate for user confirmation, carrying exactly the fields the
 * suggestion UI reads plus the identity fields the ranking-input equality
 * check compares — enough to revive the suggestion without the registry.
 */
export interface PersistedCandidate {
  repo: string;
  /** 0–1 description similarity against the installed skill's description. */
  similarity: number;
  stars: number;
  downloads: number;
  description: string;
  descriptionZh?: string;
}

/**
 * A stored resolution: the cached outcome of failed source matching.
 * `candidates` absent or empty means the dead end "no namesakes" — a
 * content-independent fact. A non-empty list is the ranked suggestion, valid
 * while `epoch` is the served snapshot and `fingerprint` still matches disk.
 */
export interface ResolutionRecord {
  name: string;
  /** The registry snapshot generation this outcome was verified against. */
  epoch: number;
  /** The computed content hash, valid while `fingerprint` matches the disk. */
  hash?: string;
  fingerprint?: SkillFingerprint;
  /** Ranked candidates for user confirmation; absent/empty = dead end. */
  candidates?: PersistedCandidate[];
  /**
   * Equality key of the ranking input (the full namesake list's identity
   * fields): a matching fresh lookup skips the similarity math.
   */
  namesakesKey?: string;
}

/** One ledger line: a skill is either linked (source) or unresolved. */
export type LedgerRecord = ProvenanceRecord | ResolutionRecord;

/**
 * The source view the UI consumes, derived from the stored records. The
 * skill's name is the key it is stored under.
 */
export interface SkillProvenance {
  repo: string;
  installedAt: string;
  hash?: string;
}

// ------------------------------------------------------------------- parsing

/** Parse one ledger line (or legacy entry) into a record; null when invalid. */
function parseRecord(value: unknown): LedgerRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.name !== "string" || entry.name.length === 0) return null;
  if (typeof entry.repo === "string" && entry.repo.length > 0) {
    const record: ProvenanceRecord = { name: entry.name, repo: entry.repo };
    if (typeof entry.installedAt === "string") record.installedAt = entry.installedAt;
    if (typeof entry.hash === "string") record.hash = entry.hash;
    return record;
  }
  return parseResolutionRecord(entry.name, entry);
}

function parseResolutionRecord(
  name: string,
  entry: Record<string, unknown>,
): ResolutionRecord | null {
  if (typeof entry.epoch !== "number" || !Number.isFinite(entry.epoch)) return null;
  const record: ResolutionRecord = { name, epoch: entry.epoch };
  if (typeof entry.hash === "string") record.hash = entry.hash;
  if (isFingerprint(entry.fingerprint)) record.fingerprint = entry.fingerprint;
  if (typeof entry.namesakesKey === "string") record.namesakesKey = entry.namesakesKey;
  if (Array.isArray(entry.candidates)) {
    const candidates = entry.candidates
      .map(parseCandidate)
      .filter((c): c is PersistedCandidate => c !== null);
    if (candidates.length > 0) record.candidates = candidates;
  }
  return record;
}

function isFingerprint(value: unknown): value is SkillFingerprint {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Record<string, unknown>;
  return (
    typeof f.mtimeMs === "number" && Number.isFinite(f.mtimeMs) &&
    typeof f.size === "number" && Number.isFinite(f.size)
  );
}

function parseCandidate(value: unknown): PersistedCandidate | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (
    typeof c.repo !== "string" || c.repo.length === 0 ||
    typeof c.similarity !== "number" || !Number.isFinite(c.similarity) ||
    typeof c.stars !== "number" || typeof c.downloads !== "number" ||
    typeof c.description !== "string"
  ) {
    return null;
  }
  const candidate: PersistedCandidate = {
    repo: c.repo,
    similarity: c.similarity,
    stars: c.stars,
    downloads: c.downloads,
    description: c.description,
  };
  if (typeof c.descriptionZh === "string") candidate.descriptionZh = c.descriptionZh;
  return candidate;
}

/**
 * Parse raw ledger content into records keyed by name, tolerating everything
 * a missing, hand-edited or older file can throw at it: the legacy v1 JSON
 * document is converted, a broken JSONL line is skipped (the rest survives),
 * and duplicate names resolve last-wins. Anything questionable degrades to
 * fewer records, which is the pre-ledger behavior — never a broken UI.
 */
export function parseLedger(raw: string | null | undefined): Map<string, LedgerRecord> {
  const records = new Map<string, LedgerRecord>();
  if (!raw) return records;
  const text = raw.trim();
  if (!text) return records;
  if (text.startsWith("{")) {
    try {
      const doc = JSON.parse(text) as { skills?: unknown };
      if (doc && typeof doc === "object" && doc.skills && typeof doc.skills === "object") {
        // Legacy v1 document: `{version, skills: {name → source}}`.
        for (const [name, entry] of Object.entries(doc.skills as Record<string, unknown>)) {
          const record = parseRecord({ ...(entry as object), name });
          if (record && "repo" in record) records.set(name, record);
        }
        return records;
      }
      // A single JSONL record parses as plain JSON.
      const record = parseRecord(doc);
      if (record) records.set(record.name, record);
      return records;
    } catch {
      // Multi-line JSONL falls through to the line parser.
    }
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = parseRecord(JSON.parse(trimmed));
      if (record) records.set(record.name, record);
    } catch {
      // A broken line is skipped, not fatal.
    }
  }
  return records;
}

/** Serialize records back to JSONL, one line per skill. */
export function serializeLedger(records: Iterable<LedgerRecord>): string {
  let text = "";
  for (const record of records) text += `${JSON.stringify(record)}\n`;
  return text;
}

// --------------------------------------------------------------- persistence

/** Storage key holding the ledger in the browser (dev server / tests). */
const BROWSER_STORAGE_KEY = "skill-one.provenance";

async function loadLedger(): Promise<Map<string, LedgerRecord>> {
  const raw = isTauri() ? await readProvenanceRaw() : storage.getItem(BROWSER_STORAGE_KEY);
  return parseLedger(raw);
}

async function saveLedger(records: Map<string, LedgerRecord>): Promise<void> {
  const text = serializeLedger(records.values());
  if (isTauri()) {
    await writeProvenanceRaw(text);
    return;
  }
  storage.setItem(BROWSER_STORAGE_KEY, text);
}

/**
 * Note the association in the activity log. An `install` and a user-confirmed
 * link are the user's doing; the hash and description tiers decide on their
 * own, so their lines carry the `auto` actor.
 */
async function logSkillSourceLink(
  repo: string,
  name: string,
  reason: SourceLinkReason,
): Promise<void> {
  await logActivity({
    event: "source.link",
    actor: reason === "hash" || reason === "description" ? "auto" : "user",
    kind: "skill",
    names: [name],
    detail: { repo, reason },
  });
}

/**
 * Record where a freshly installed skill came from. Best-effort by contract:
 * a ledger write failure is logged and swallowed so it can never fail (or
 * slow down feedback for) the install it documents.
 */
export async function recordSkillProvenance(
  repo: string,
  name: string,
  hash?: string,
  reason: SourceLinkReason = "install",
): Promise<void> {
  try {
    const ledger = await loadLedger();
    ledger.set(name, {
      name,
      repo,
      installedAt: new Date().toISOString(),
      ...(hash ? { hash } : {}),
    });
    await saveLedger(ledger);
    await logSkillSourceLink(repo, name, reason);
  } catch (e) {
    console.warn("provenance: failed to record install source", e);
  }
}

/**
 * Record several freshly auto-linked skills in one read-modify-write pass —
 * the hash tier can match a handful of skills in one reconcile, and each of
 * them writing the file on its own would be N reads + N writes for what is
 * logically one ledger update.
 */
export async function recordSkillProvenanceBatch(
  entries: Array<{
    repo: string;
    name: string;
    hash?: string;
    reason?: SourceLinkReason;
  }>,
): Promise<void> {
  try {
    const ledger = await loadLedger();
    for (const entry of entries) {
      ledger.set(entry.name, {
        name: entry.name,
        repo: entry.repo,
        installedAt: new Date().toISOString(),
        ...(entry.hash ? { hash: entry.hash } : {}),
      });
    }
    await saveLedger(ledger);
    for (const entry of entries) {
      await logSkillSourceLink(entry.repo, entry.name, entry.reason ?? "hash");
    }
  } catch (e) {
    console.warn("provenance: failed to record install sources", e);
  }
}

/**
 * Forget a skill's provenance after uninstall. Best-effort like recording:
 * the ledger must never turn a removal into an error.
 */
export async function removeSkillProvenance(name: string): Promise<void> {
  try {
    const ledger = await loadLedger();
    if (!ledger.delete(name)) return;
    await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to forget install source", e);
  }
}

/**
 * Forget several skills' provenance after one uninstall pass — the batch
 * removal of a whole repository is logically one ledger update. Best-effort
 * like recording.
 */
export async function removeSkillProvenanceBatch(names: readonly string[]): Promise<void> {
  try {
    const ledger = await loadLedger();
    let changed = false;
    for (const name of names) changed = ledger.delete(name) || changed;
    if (changed) await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to forget install sources", e);
  }
}

/**
 * Reconcile the ledger with the on-disk truth and return the current
 * name→source map. Called whenever the installed list is (re)loaded: skills
 * removed outside the app stop claiming a source, and stale resolution
 * records for removed skills are pruned with them.
 */
export async function reconcileProvenance(
  installedNames: readonly string[],
): Promise<Record<string, SkillProvenance>> {
  const ledger = await loadLedger();
  const installed = new Set(installedNames);
  let changed = false;
  // Deleting the current entry during a Map iteration is safe (and defined).
  for (const name of ledger.keys()) {
    if (!installed.has(name)) {
      ledger.delete(name);
      changed = true;
    }
  }
  if (changed) await saveLedger(ledger);
  const sources: Record<string, SkillProvenance> = {};
  for (const record of ledger.values()) {
    if ("repo" in record) {
      sources[record.name] = {
        repo: record.repo,
        installedAt: record.installedAt ?? "",
        ...(record.hash !== undefined ? { hash: record.hash } : {}),
      };
    }
  }
  return sources;
}

// ------------------------------------------------- resolution record storage

/**
 * Load every stored resolution (the failed-matching cache) keyed by name.
 * A cheap single-file read; the reuse decisions live in `link-suggestions.ts`.
 */
export async function loadResolutionRecords(): Promise<Record<string, ResolutionRecord>> {
  const ledger = await loadLedger();
  const resolutions: Record<string, ResolutionRecord> = {};
  for (const record of ledger.values()) {
    if ("epoch" in record) resolutions[record.name] = record;
  }
  return resolutions;
}

/**
 * Persist resolution upserts and drops in one read-modify-write pass. Neither
 * touches a source record: a drop only removes resolution records, and an
 * upsert never demotes a name that already carries a source (the auto-link
 * write that usually accompanies them wins).
 */
export async function saveResolutionRecords(
  upserts: readonly ResolutionRecord[],
  drops: readonly string[],
): Promise<void> {
  if (upserts.length === 0 && drops.length === 0) return;
  const ledger = await loadLedger();
  const isResolution = (record: LedgerRecord | undefined): record is ResolutionRecord =>
    record !== undefined && "epoch" in record;
  for (const name of drops) {
    if (isResolution(ledger.get(name))) ledger.delete(name);
  }
  for (const record of upserts) {
    const existing = ledger.get(record.name);
    if (existing === undefined || "epoch" in existing) ledger.set(record.name, record);
  }
  await saveLedger(ledger);
}

// ------------------------------------------------- browser mock hooks (tests)

/**
 * Seed the browser ledger directly (dev server demos, tests). No-op inside
 * Tauri, where the real file is the only source of truth.
 */
export function seedMockProvenance(
  entries: Record<string, { repo: string }>,
): void {
  if (isTauri()) return;
  const ledger: LedgerRecord[] = [];
  for (const [name, e] of Object.entries(entries)) {
    ledger.push({ name, repo: e.repo, installedAt: new Date().toISOString() });
  }
  storage.setItem(BROWSER_STORAGE_KEY, serializeLedger(ledger));
}

/** Clear the browser ledger (test reset). No-op inside Tauri. */
export function resetMockProvenance(): void {
  if (isTauri()) return;
  storage.removeItem(BROWSER_STORAGE_KEY);
}
