/**
 * Provenance ledger: the app's own record of what it knows about each
 * installed skill, stored as `.skill-one.jsonl` inside the global skills
 * directory (`~/.agents/skills`) — one JSON line per record, last one wins.
 *
 * The opening line is always a `meta` header; every line after it carries an
 * explicit `kind`, so a record says what it is instead of letting the reader
 * infer it from which fields happen to be present:
 *
 * - **source** — where the skill came from: recorded at install time, on a
 *   confirmed link, or by an auto link. `agents-skills` 0.13 dropped its
 *   lockfile; this restores the store↔install association at the app level.
 * - **pending** — an association the user has not made yet: the ranked
 *   `candidates` awaiting their confirmation, the repos they cut (`repos`),
 *   and the guards that let an unchanged ranking be reused without redoing the
 *   similarity math. Persisting these keeps an app restart from re-ranking
 *   every unlinked skill.
 * - **tag-def** — one user-defined tag: `key` plus its display `label`. The
 *   system domains are code, not ledger lines; these are the only taxonomy
 *   the user can extend.
 * - **skill-tag** — one installed skill's chosen tag: skill `name` plus the
 *   tag `key` (a system domain key or a `tag-def` key). A single override —
 *   last one wins — that the installed list reads ahead of the store's
 *   classification. An empty `tag` clears the choice.
 *
 * `meta.index` is the identity of the registry snapshot those pending records
 * were computed against, which makes "is this cache still good?" one
 * comparison against the snapshot being served now. It is deliberately *not*
 * the client-side `epoch` counter: that restarts at zero with every process,
 * so persisting it would validate a month-old record against today's dataset.
 *
 * The file is a hidden dotfile without a SKILL.md, so the agents-skills
 * directory scan ignores it and it never shows up as a skill. It is
 * best-effort on both ends: install/remove never fail because the ledger
 * could not be written, and a missing or unreadable file degrades to the
 * pre-ledger behavior (name-only matching). Per-line tolerance is the only
 * tolerance there is: a line the parser does not recognize — broken,
 * hand-edited, or written by another version — is skipped and the rest of the
 * ledger survives. There is no format version and no older shape to read; a
 * format change is a whole-file replacement, and whatever this build could
 * parse it can also express.
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

/**
 * A stored source record: one installed skill's store identity.
 *
 * Two facts, both load-bearing. `repo` is the association itself; `via` is how
 * it was established — `install` (the app installed the skill itself),
 * `confirm` (the user picked the source from candidates), or
 * `description`/`hash` (auto-linked) — which is how the UI tells a store
 * install from a third-party copy whose source was matched later.
 */
export interface SourceRecord {
  kind: "source";
  /** The skill's name — the directory name, unique in the global directory. */
  name: string;
  /** The GitHub repo the skill was installed from, as `owner/repo`. */
  repo: string;
  /**
   * How the association was established: `install` (the app installed the
   * skill itself), `confirm` (the user picked the source from candidates), or
   * `description` (auto-linked). Absent means an older record — treated as
   * unknown, not as `install`.
   */
  via?: SourceLinkReason;
}

/**
 * Stat-only change-detection identity of a skill directory, as stored in a
 * pending record. The same shape `skillFingerprint` returns, re-exported so the
 * stored record and the value it is checked against cannot drift apart.
 */
export type { SkillFingerprint };

/**
 * A stored candidate for user confirmation, carrying exactly the fields the
 * suggestion UI reads — enough to revive the suggestion without the registry.
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
 * A stored pending association: what the app still owes the user a decision
 * about. Every field is optional and a record carrying none of them is not
 * worth keeping — the two shapes that are worth keeping are the ranking
 * awaiting confirmation (`candidates`, guarded by `key` and `fingerprint`)
 * and the repos the user cut (`repos`), which must outlive any cache.
 */
export interface PendingRecord {
  kind: "pending";
  /** The skill's name — the directory name, unique in the global directory. */
  name: string;
  /**
   * Digest of the ranking input (the full namesake list's identity fields): a
   * fresh lookup carrying the same digest ranks identically over unchanged
   * content, so the similarity math is skipped.
   */
  key?: string;
  /**
   * The directory state the stored ranking was computed against. The ranking
   * reads the local description, so it is only reusable while the stat-only
   * fingerprint still matches disk.
   */
  fingerprint?: SkillFingerprint;
  /** Ranked candidates for user confirmation. */
  candidates?: PersistedCandidate[];
  /**
   * Repos the user explicitly cut or rejected for this skill. The auto-link
   * tier never links them again; they still surface as manual candidates,
   * since picking one is the user's own act of re-identification.
   */
  repos?: string[];
}

/** One ledger line below the header: a skill is either linked or pending. */
export type LedgerRecord =
  | SourceRecord
  | PendingRecord
  | TagDefRecord
  | SkillTagRecord;

/**
 * One user-defined tag: the taxonomy extension the system domains do not
 * cover. Keyed by `key` rather than by skill name — it belongs to no skill
 * until a `skill-tag` line points at it — and surviving skill prunes: an
 * unused tag is still the user's taxonomy, not a stale cache.
 */
export interface TagDefRecord {
  kind: "tag-def";
  /** The tag's key: the user's trimmed label, whitespace folded to `-`. */
  key: string;
  /** The display name, one spelling for both locales. */
  label: string;
  /** The tag's mark; absent means the label's first character. */
  emoji?: string;
}

/**
 * One installed skill's chosen tag: the single-select override the installed
 * list reads ahead of the store's classification. The `tag` is a system
 * domain key or a `tag-def` key; an empty one clears the choice.
 */
export interface SkillTagRecord {
  kind: "skill-tag";
  /** The skill's name — the directory name, unique in the global directory. */
  name: string;
  /** The chosen tag's key. */
  tag: string;
}

/**
 * A parsed file: the snapshot identity its caches belong to, plus one record
 * per skill keyed by name.
 *
 * `index` is that identity — the served snapshot's freshness identity
 * (`IndexInfo.etag`: equal etag, equal index bytes). Absent, it costs every
 * `pending` record its validity and nothing else: a snapshot that cannot name
 * itself cannot vouch for a ranking computed against it.
 *
 * Tag lines ride the same file under their own maps: `tagDefs` keyed by tag
 * key, `skillTags` as skill name → tag key. They are taxonomy, not snapshot
 * cache, so `index` never invalidates them.
 */
export interface ParsedLedger {
  index?: string;
  /** Source/pending records keyed by skill name; tag lines live below. */
  records: Map<string, SourceRecord | PendingRecord>;
  tagDefs: Map<string, TagDefRecord>;
  skillTags: Map<string, string>;
}

/**
 * The source view the UI consumes, derived from the stored records. The
 * skill's name is the key it is stored under.
 */
export interface SkillProvenance {
  repo: string;
  via?: SourceLinkReason;
}

// ------------------------------------------------------------------- parsing

/** The reasons a source association can carry (mirrors `SourceLinkReason`). */
const SOURCE_LINK_REASONS: ReadonlySet<string> = new Set([
  "install",
  "description",
  "confirm",
]);

/** Parse one ledger line into a record; null when it is not one we can use. */
function parseRecord(value: unknown): LedgerRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  // Tag definitions belong to no skill, so they carry a `key` instead of a
  // `name` and are checked before the name gate below.
  if (entry.kind === "tag-def") return parseTagDef(entry);
  if (entry.kind === "skill-tag") return parseSkillTag(entry);
  if (typeof entry.name !== "string" || entry.name.length === 0) return null;
  if (entry.kind === "source") return parseSourceRecord(entry.name, entry);
  if (entry.kind === "pending") return parsePendingRecord(entry.name, entry);
  // A line whose `kind` is missing or unknown is skipped rather than guessed
  // at. That is also what a future format gets: its lines are dropped and the
  // rest of the file still answers, which is the whole safety story.
  return null;
}

function parseSourceRecord(
  name: string,
  entry: Record<string, unknown>,
): SourceRecord | null {
  if (typeof entry.repo !== "string" || entry.repo.length === 0) return null;
  const record: SourceRecord = { kind: "source", name, repo: entry.repo };
  if (typeof entry.via === "string" && SOURCE_LINK_REASONS.has(entry.via)) {
    record.via = entry.via as SourceLinkReason;
  }
  return record;
}

function parsePendingRecord(
  name: string,
  entry: Record<string, unknown>,
): PendingRecord | null {
  const record: PendingRecord = { kind: "pending", name };
  if (typeof entry.key === "string" && entry.key.length > 0) record.key = entry.key;
  if (isFingerprint(entry.fingerprint)) record.fingerprint = entry.fingerprint;
  const repos = parseRepos(entry.repos);
  if (repos) record.repos = repos;
  if (Array.isArray(entry.candidates)) {
    const candidates = entry.candidates
      .map(parseCandidate)
      .filter((c): c is PersistedCandidate => c !== null);
    if (candidates.length > 0) record.candidates = candidates;
  }
  // Neither a ranking to revive nor a cut to honor: nothing here is worth a
  // line, so the record joins the caches v3 stopped writing.
  if (!record.candidates && !record.repos) return null;
  return record;
}

/** A list of `owner/repo` strings; null when nothing usable is left in it. */
function parseRepos(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const repos = value.filter(
    (repo): repo is string => typeof repo === "string" && repo.length > 0,
  );
  return repos.length > 0 ? repos : null;
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

/** Parse a user-defined tag; null when its key or label is unusable. */
function parseTagDef(entry: Record<string, unknown>): TagDefRecord | null {
  if (typeof entry.key !== "string" || typeof entry.label !== "string") {
    return null;
  }
  const key = entry.key.trim();
  const label = entry.label.trim();
  if (key.length === 0 || label.length === 0) return null;
  const record: TagDefRecord = { kind: "tag-def", key, label };
  if (typeof entry.emoji === "string" && entry.emoji.trim().length > 0) {
    record.emoji = entry.emoji.trim();
  }
  return record;
}

/**
 * Parse one skill's chosen tag. An empty `tag` is the explicit clear: it
 * parses (so the line counts as seen) and the ledger drops the assignment
 * rather than keeping one.
 */
function parseSkillTag(entry: Record<string, unknown>): SkillTagRecord | null {
  if (typeof entry.name !== "string" || entry.name.length === 0) return null;
  if (typeof entry.tag !== "string") return null;
  return { kind: "skill-tag", name: entry.name, tag: entry.tag.trim() };
}

/**
 * Parse raw ledger content into records keyed by name, tolerating everything a
 * missing or hand-edited file can throw at it: a line that is not JSON is
 * skipped, a line the parser does not recognize is skipped, and duplicate
 * names resolve last-wins. Anything questionable degrades to fewer records,
 * which is the pre-ledger behavior — never a broken UI.
 */
export function parseLedger(raw: string | null | undefined): ParsedLedger {
  const ledger: ParsedLedger = {
    records: new Map(),
    tagDefs: new Map(),
    skillTags: new Map(),
  };
  if (!raw) return ledger;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      // A broken line is skipped, not fatal.
      continue;
    }
    if (typeof value !== "object" || value === null) continue;
    const entry = value as Record<string, unknown>;
    if (entry.kind === "meta") {
      // The header may sit anywhere; the last one read wins, so a stray copy
      // later in the file cannot roll the identity back.
      if (typeof entry.index === "string" && entry.index.length > 0) {
        ledger.index = entry.index;
      }
      continue;
    }
    const record = parseRecord(entry);
    if (!record) continue;
    // Tag lines keep their own maps — and survive skill prunes — while
    // source/pending lines stay keyed by skill name, last one winning.
    if (record.kind === "tag-def") {
      ledger.tagDefs.set(record.key, record);
    } else if (record.kind === "skill-tag") {
      if (record.tag) ledger.skillTags.set(record.name, record.tag);
      else ledger.skillTags.delete(record.name);
    } else {
      ledger.records.set(record.name, record);
    }
  }
  return ledger;
}

/**
 * Serialize back to JSONL: the header line, then one line per record. Tag
 * definitions and assignments ride the same file after the skill records,
 * sorted for a stable diff — the parse is order-insensitive, so this order
 * is a readability choice, not a contract.
 */
export function serializeLedger(
  index: string | undefined,
  records: Iterable<LedgerRecord>,
  tagDefs?: Iterable<TagDefRecord>,
  skillTags?: Iterable<readonly [string, string]>,
): string {
  const header = index ? { kind: "meta", index } : { kind: "meta" };
  let text = `${JSON.stringify(header)}\n`;
  for (const record of records) text += `${JSON.stringify(record)}\n`;
  const defs = tagDefs ? [...tagDefs].toSorted((a, b) => a.key.localeCompare(b.key)) : [];
  for (const def of defs) text += `${JSON.stringify(def)}\n`;
  const tags = skillTags ? [...skillTags].toSorted(([a], [b]) => a.localeCompare(b)) : [];
  for (const [name, tag] of tags) {
    text += `${JSON.stringify({ kind: "skill-tag", name, tag })}\n`;
  }
  return text;
}

// --------------------------------------------------------------- persistence

/** Storage key holding the ledger in the browser (dev server / tests). */
const BROWSER_STORAGE_KEY = "skill-one.provenance";

async function loadLedger(): Promise<ParsedLedger> {
  const raw = isTauri() ? await readProvenanceRaw() : storage.getItem(BROWSER_STORAGE_KEY);
  return parseLedger(raw);
}

async function saveLedger(ledger: ParsedLedger): Promise<void> {
  const text = serializeLedger(
    ledger.index,
    ledger.records.values(),
    ledger.tagDefs.values(),
    ledger.skillTags.entries(),
  );
  if (isTauri()) {
    await writeProvenanceRaw(text);
    return;
  }
  storage.setItem(BROWSER_STORAGE_KEY, text);
}

/**
 * Note the association in the activity log — where an install happened is a
 * fact about time, and the ledger deliberately does not keep timestamps. An
 * `install` and a user-confirmed link are the user's doing; the auto-link
 * decides on its own, so its line carries the `auto` actor.
 */
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
 * Record where a freshly installed skill came from. Best-effort by contract:
 * a ledger write failure is logged and swallowed so it can never fail (or
 * slow down feedback for) the install it documents.
 */
export async function recordSkillProvenance(
  repo: string,
  name: string,
  reason: SourceLinkReason = "install",
): Promise<void> {
  try {
    const ledger = await loadLedger();
    ledger.records.set(name, { kind: "source", name, repo, via: reason });
    await saveLedger(ledger);
    await logSkillSourceLink(repo, name, reason);
  } catch (e) {
    console.warn("provenance: failed to record install source", e);
  }
}

/**
 * Record several freshly auto-linked skills in one read-modify-write pass —
 * one reconcile can match a handful of skills, and each of them writing the
 * file on its own would be N reads + N writes for what is logically one
 * ledger update. `reason` is required: a batch only ever comes from the
 * auto-link tiers, and guessing "the app installed this" on its behalf would
 * be a claim nobody made.
 */
export async function recordSkillProvenanceBatch(
  entries: readonly { repo: string; name: string; reason: SourceLinkReason }[],
): Promise<void> {
  try {
    const ledger = await loadLedger();
    for (const entry of entries) {
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

/**
 * Forget a skill's provenance after uninstall. Best-effort like recording:
 * the ledger must never turn a removal into an error.
 */
export async function removeSkillProvenance(name: string): Promise<void> {
  try {
    const ledger = await loadLedger();
    if (!ledger.records.delete(name)) return;
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
    for (const name of names) changed = ledger.records.delete(name) || changed;
    if (changed) await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to forget install sources", e);
  }
}

/**
 * Record that the user cut a skill's source association: the source record is
 * replaced by a pending record carrying the repo in `repos`, so the auto-link
 * tiers never link it back on their own. Whatever else the record already
 * knew — its candidates, fingerprint and ranking digest — is kept, because
 * the user's cut does not invalidate work already done. A manual pick
 * overwrites the record, which is exactly the act of re-identification.
 *
 * The header is left alone: the surviving records were verified against the
 * snapshot already named there, and re-stamping it with the one being served
 * now would vouch for rankings this call never looked at.
 *
 * Best-effort like every ledger write.
 */
export async function dismissSkillSource(name: string, repo: string): Promise<void> {
  try {
    const ledger = await loadLedger();
    const existing = ledger.records.get(name);
    const kept = existing?.kind === "pending" ? existing : null;
    const repos = new Set(kept?.repos ?? []);
    repos.add(repo);
    // `kind` first so the kept fields follow it in the written line.
    ledger.records.set(name, { kind: "pending", ...kept, name, repos: [...repos] });
    await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to dismiss install source", e);
  }
}

/**
 * What one reconciliation knows about the installed list: which store entries
 * the skills are linked to, and which repos the user has cut for the ones that
 * are not.
 *
 * Both come out of the same pass over one read of the ledger, because they are
 * the two halves of one association — a skill is either linked to a repo or
 * waiting behind a cut — and a caller that had to reconcile twice to learn both
 * could read a state that never existed.
 */
export interface ReconciledProvenance {
  /** Skills the app has a source for: name → `{repo, via?}`. */
  sources: Record<string, SkillProvenance>;
  /**
   * Repos the user cut, per skill. The auto-link tier never links these back,
   * so the surfaces that offer a namesake mark them rather than offering a repo
   * they already refused as if it were new.
   */
  cut: Record<string, string[]>;
}

/**
 * Reconcile the ledger with the on-disk truth and return what it now says.
 * Called whenever the installed list is (re)loaded: skills removed outside the
 * app stop claiming a source, and stale pending records for removed skills are
 * pruned with them.
 */
export async function reconcileProvenance(
  installedNames: readonly string[],
): Promise<ReconciledProvenance> {
  const ledger = await loadLedger();
  const installed = new Set(installedNames);
  let changed = false;
  // Deleting the current entry during a Map iteration is safe (and defined).
  for (const name of ledger.records.keys()) {
    if (!installed.has(name)) {
      ledger.records.delete(name);
      changed = true;
    }
  }
  // A removed skill takes its tag choice with it; the definitions stay — an
  // unused tag is still the user's taxonomy, not a stale cache.
  for (const name of ledger.skillTags.keys()) {
    if (!installed.has(name)) {
      ledger.skillTags.delete(name);
      changed = true;
    }
  }
  if (changed) await saveLedger(ledger);
  const sources: Record<string, SkillProvenance> = {};
  const cut: Record<string, string[]> = {};
  for (const record of ledger.records.values()) {
    if (record.kind === "source") {
      sources[record.name] = {
        repo: record.repo,
        ...(record.via !== undefined ? { via: record.via } : {}),
      };
    } else if (record.repos?.length) {
      cut[record.name] = [...record.repos];
    }
  }
  return { sources, cut };
}

// ---------------------------------------------------- pending record storage

/**
 * The stored pending records plus the snapshot identity they were verified
 * against. An absent `index` means the file names no snapshot — every record
 * below is then stale by definition, and the caller recomputes.
 */
export interface StoredPending {
  index?: string;
  records: Record<string, PendingRecord>;
}

/**
 * Load the pending records (the suggestions awaiting a decision, and the repos
 * the user cut) keyed by name. A cheap single-file read; the reuse decisions
 * live in `link-suggestions.ts`.
 */
export async function loadPendingRecords(): Promise<StoredPending> {
  const ledger = await loadLedger();
  const records: Record<string, PendingRecord> = {};
  for (const record of ledger.records.values()) {
    if (record.kind === "pending") records[record.name] = record;
  }
  return { ...(ledger.index !== undefined ? { index: ledger.index } : {}), records };
}

/**
 * Persist pending upserts and drops in one read-modify-write pass, and
 * re-stamp the header with the snapshot they now belong to. Neither touches a
 * source record: a drop only removes pending records, and an upsert never
 * demotes a name that already carries a source (the auto-link write that
 * usually accompanies them wins).
 */
export async function savePendingRecords(
  upserts: readonly PendingRecord[],
  drops: readonly string[],
  index: string | undefined,
): Promise<void> {
  if (upserts.length === 0 && drops.length === 0) return;
  const ledger = await loadLedger();
  for (const name of drops) {
    if (ledger.records.get(name)?.kind === "pending") ledger.records.delete(name);
  }
  for (const record of upserts) {
    const existing = ledger.records.get(record.name);
    if (existing === undefined || existing.kind === "pending") {
      ledger.records.set(record.name, record);
    }
  }
  ledger.index = index;
  await saveLedger(ledger);
}

// ------------------------------------------------------------- custom tags

/**
 * One user-defined tag as the UI consumes it: the ledger's `tag-def` line
 * without the `kind` discriminator.
 */
export interface CustomTagDef {
  key: string;
  label: string;
  /** The tag's mark; absent means the label's first character. */
  emoji?: string;
}

/**
 * The user taxonomy plus every installed skill's choice: definitions keyed
 * by tag key (in key order, so menus read stably) and assignments as
 * skill name → tag key.
 */
export interface CustomTags {
  tagDefs: CustomTagDef[];
  skillTags: Record<string, string>;
}

/**
 * Load the user taxonomy and the installed skills' tag choices. Cheap
 * single-file read; unknown lines never fail it (see `parseLedger`).
 */
export async function loadCustomTags(): Promise<CustomTags> {
  const ledger = await loadLedger();
  const tagDefs = [...ledger.tagDefs.values()]
    .toSorted((a, b) => a.key.localeCompare(b.key))
    .map(({ key, label, emoji }) => ({
      key,
      label,
      ...(emoji !== undefined ? { emoji } : {}),
    }));
  const skillTags: Record<string, string> = {};
  for (const [name, tag] of ledger.skillTags) skillTags[name] = tag;
  return { tagDefs, skillTags };
}

/**
 * Define a tag (or rename the label / change the mark of the key it
 * normalizes to). Best-effort like every ledger write. Validation
 * (emptiness, reserved system keys, duplicates) is the caller's
 * (`lib/custom-tags`); the ledger stores what well-formed lines carry.
 */
export async function saveCustomTagDef(
  key: string,
  label: string,
  emoji?: string,
): Promise<void> {
  try {
    const ledger = await loadLedger();
    ledger.tagDefs.set(key, {
      kind: "tag-def",
      key,
      label,
      ...(emoji !== undefined ? { emoji } : {}),
    });
    await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to save custom tag", e);
  }
}

/**
 * Remove a tag definition. Assignments pointing at it are dropped with it,
 * so no skill keeps pointing at a tag that no longer exists; the skills
 * fall back to the store's classification (or unclassified).
 * Best-effort like every ledger write.
 */
export async function deleteCustomTagDef(key: string): Promise<void> {
  try {
    const ledger = await loadLedger();
    let changed = ledger.tagDefs.delete(key);
    for (const [name, tag] of ledger.skillTags) {
      if (tag === key) {
        ledger.skillTags.delete(name);
        changed = true;
      }
    }
    if (changed) await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to delete custom tag", e);
  }
}

/**
 * Rename a tag definition, moving every assignment pointing at the old key
 * along in the same read-modify-write pass — a rename must never orphan a
 * choice, and split writes could leave the file between the two. The skills
 * keep filing where the user filed them, under the new key; the list scope
 * naming the old key is the caller's to follow (see the tag menu).
 * Best-effort like every ledger write. A missing old key writes nothing.
 */
export async function renameCustomTagDef(
  oldKey: string,
  newKey: string,
  label: string,
  emoji?: string,
): Promise<void> {
  try {
    const ledger = await loadLedger();
    if (!ledger.tagDefs.has(oldKey)) return;
    ledger.tagDefs.delete(oldKey);
    ledger.tagDefs.set(newKey, {
      kind: "tag-def",
      key: newKey,
      label,
      ...(emoji !== undefined ? { emoji } : {}),
    });
    for (const [name, tag] of ledger.skillTags) {
      if (tag === oldKey) ledger.skillTags.set(name, newKey);
    }
    await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to rename custom tag", e);
  }
}

/**
 * Choose one installed skill's tag — a system domain key or a `tag-def`
 * key — or clear it back to the store's classification with `null`.
 * Best-effort like every ledger write.
 */
export async function setSkillTag(
  name: string,
  tag: string | null,
): Promise<void> {
  try {
    const ledger = await loadLedger();
    if (tag == null || tag === "") ledger.skillTags.delete(name);
    else ledger.skillTags.set(name, tag);
    await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to set skill tag", e);
  }
}

/**
 * Assign a custom tag to multiple skills in one ledger read-write cycle.
 */
export async function setManySkillTags(
  names: readonly string[],
  tag: string | null,
): Promise<void> {
  try {
    const ledger = await loadLedger();
    for (const name of names) {
      if (tag == null || tag === "") ledger.skillTags.delete(name);
      else ledger.skillTags.set(name, tag);
    }
    await saveLedger(ledger);
  } catch (e) {
    console.warn("provenance: failed to set many skill tags", e);
  }
}


// ------------------------------------------------------- developer inspector

/**
 * The raw ledger content, whichever store backs it: the `.skill-one.jsonl`
 * file inside Tauri, the browser stand-in otherwise. Unlike `loadLedger` (the
 * write paths' internal helper) it does not parse or normalize — the
 * developer viewer renders the file as it is on disk.
 */
export async function readLedgerRaw(): Promise<string | null> {
  if (isTauri()) return readProvenanceRaw();
  return storage.getItem(BROWSER_STORAGE_KEY);
}

/**
 * One rendered line of the ledger: the parsed JSON value when the line is
 * well-formed JSON, the raw text when it is not (a broken line stays visible
 * in the developer viewer, flagged — the inspector shows the file as it is,
 * it does not silently skip what `parseLedger` tolerates).
 */
export interface LedgerLine {
  /** 1-based position in the raw content. */
  line: number;
  /** The parsed value (any JSON — field validity is the viewer's call). */
  record?: unknown;
  /** The verbatim text of a line that did not parse. */
  text?: string;
}

/**
 * Split raw ledger content into per-line entries for the developer viewer,
 * keeping the file's own order and duplicates (no last-wins merging — the
 * viewer shows what was written, `parseLedger` decides what the UI acts on).
 */
export function ledgerLines(raw: string | null | undefined): LedgerLine[] {
  if (!raw) return [];
  // Split the raw text, not the trimmed one: the line number is the line's
  // real position in the file, blank lines included.
  return raw.split("\n").flatMap((line, index): LedgerLine[] => {
    const trimmed = line.trim();
    if (!trimmed) return [];
    try {
      return [{ line: index + 1, record: JSON.parse(trimmed) }];
    } catch {
      return [{ line: index + 1, text: trimmed }];
    }
  });
}

/**
 * Reveal the ledger's directory (the global skills directory) in the system
 * file manager. A no-op in the browser, where there is no file to reveal.
 */
export async function revealProvenanceDir(): Promise<void> {
  if (isTauri()) await openProvenanceDirRaw();
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
  const records: LedgerRecord[] = [];
  for (const [name, e] of Object.entries(entries)) {
    records.push({ kind: "source", name, repo: e.repo, via: "install" });
  }
  storage.setItem(BROWSER_STORAGE_KEY, serializeLedger(undefined, records));
}

/** Clear the browser ledger (test reset). No-op inside Tauri. */
export function resetMockProvenance(): void {
  if (isTauri()) return;
  storage.removeItem(BROWSER_STORAGE_KEY);
}

/**
 * Seed the browser ledger with custom tags directly (dev server demos,
 * tests). No-op inside Tauri, where the real file is the only source of
 * truth.
 */
export function seedMockCustomTags(
  defs: readonly { key: string; label: string; emoji?: string }[] = [],
  assignments: Record<string, string> = {},
): void {
  if (isTauri()) return;
  const records: LedgerRecord[] = [];
  for (const { key, label, emoji } of defs) {
    records.push({
      kind: "tag-def",
      key,
      label,
      ...(emoji !== undefined ? { emoji } : {}),
    });
  }
  for (const [name, tag] of Object.entries(assignments)) {
    records.push({ kind: "skill-tag", name, tag });
  }
  const existing = storage.getItem(BROWSER_STORAGE_KEY);
  const parsed = parseLedger(existing);
  const text = serializeLedger(
    parsed.index,
    parsed.records.values(),
    [...parsed.tagDefs.values(), ...records.filter((r): r is TagDefRecord => r.kind === "tag-def")],
    [
      ...parsed.skillTags.entries(),
      ...records.filter((r): r is SkillTagRecord => r.kind === "skill-tag").map(
        (r): readonly [string, string] => [r.name, r.tag] as const,
      ),
    ],
  );
  storage.setItem(BROWSER_STORAGE_KEY, text);
}

/**
 * Seed the browser ledger with verbatim raw content (developer-viewer demos
 * and tests: broken lines, duplicates and pending records that the structured
 * seed above cannot express). No-op inside Tauri.
 */
export function seedMockLedgerRaw(raw: string): void {
  if (isTauri()) return;
  storage.setItem(BROWSER_STORAGE_KEY, raw);
}
