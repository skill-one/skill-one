/**
 * Provenance ledger: the app's own record of where each installed skill came
 * from, restoring the store↔install association that agents-skills 0.13
 * dropped with its lockfile.
 *
 * The ledger is a single JSON file — `.skill-one.json` inside the global
 * skills directory (`~/.agents/skills`) — written after every successful
 * install and pruned during reconciliation. It is keyed by skill name (the
 * directory name, which is unique in the global directory) and maps it to the
 * canonical store id: `repo` (`owner/repo`) + `slug`. The file is a hidden
 * dotfile without a SKILL.md, so the agents-skills directory scan ignores it.
 *
 * The ledger is best-effort on both ends: install/remove never fail because
 * the ledger could not be written, and a missing or corrupt file degrades to
 * the pre-ledger behavior (name-only matching).
 */

import { isTauri } from "./tauri";
import { readProvenanceRaw, writeProvenanceRaw } from "./skills-manager";

/** One installed skill's store identity: the canonical `{owner}/{repo}/{slug}` id. */
export interface SkillProvenance {
  /** The GitHub repo the skill was installed from, as `owner/repo`. */
  repo: string;
  /** The skill's slug — the name it is installed under (the directory name). */
  slug: string;
  /** When the skill was installed (ISO 8601). Rewritten on reinstalls. */
  installedAt: string;
  /**
   * The upstream content hash of the skill as it was installed (the same
   * hash the registry index publishes). Optional and purely a cache: a
   * future update check compares it against the index's latest rev, and a
   * locally modified skill invalidates it — recompute on demand when the
   * answer matters.
   */
  hash?: string;
}

/** The ledger document persisted as `.skill-one.json`. */
export interface ProvenanceLedger {
  version: 1;
  /** Keyed by skill name; the name is unique in the global skills directory. */
  skills: Record<string, SkillProvenance>;
}

/** Ledger schema version this build reads and writes. */
const LEDGER_VERSION = 1;

/** An empty, valid ledger. */
export function emptyProvenanceLedger(): ProvenanceLedger {
  return { version: LEDGER_VERSION, skills: {} };
}

/**
 * Parse raw ledger content into a ledger, tolerating everything a missing,
 * hand-edited or older file can throw at it: blank content, invalid JSON, a
 * wrong version, or entries that are not well-formed store ids. Anything
 * questionable degrades to an empty ledger (or drops the bad entries), which
 * is the pre-ledger behavior — never a broken UI.
 */
export function parseProvenanceLedger(raw: string | null | undefined): ProvenanceLedger {
  if (!raw) return emptyProvenanceLedger();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyProvenanceLedger();
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    (parsed as { version?: unknown }).version !== LEDGER_VERSION
  ) {
    return emptyProvenanceLedger();
  }
  const skills = (parsed as { skills?: unknown }).skills;
  if (typeof skills !== "object" || skills === null) {
    return emptyProvenanceLedger();
  }
  const ledger = emptyProvenanceLedger();
  for (const [name, entry] of Object.entries(skills as Record<string, unknown>)) {
    const e = entry as Partial<SkillProvenance> | null;
    if (
      typeof name === "string" &&
      name.length > 0 &&
      typeof e?.repo === "string" &&
      e.repo.length > 0 &&
      typeof e?.slug === "string" &&
      e.slug.length > 0
    ) {
      ledger.skills[name] = {
        repo: e.repo,
        slug: e.slug,
        installedAt: typeof e.installedAt === "string" ? e.installedAt : "",
        ...(typeof e.hash === "string" ? { hash: e.hash } : {}),
      };
    }
  }
  return ledger;
}

/** Insert or replace one entry; the installedAt timestamp is set here. */
export function upsertProvenanceEntry(
  ledger: ProvenanceLedger,
  entry: { repo: string; slug: string; hash?: string },
): ProvenanceLedger {
  return {
    ...ledger,
    skills: {
      ...ledger.skills,
      [entry.slug]: {
        repo: entry.repo,
        slug: entry.slug,
        installedAt: new Date().toISOString(),
        ...(entry.hash ? { hash: entry.hash } : {}),
      },
    },
  };
}

/** Drop one entry (after uninstall); a no-op when the name is unknown. */
export function dropProvenanceEntry(
  ledger: ProvenanceLedger,
  name: string,
): ProvenanceLedger {
  if (!(name in ledger.skills)) return ledger;
  const skills = { ...ledger.skills };
  delete skills[name];
  return { ...ledger, skills };
}

/**
 * Prune entries whose skill no longer exists on disk (removed outside the
 * app, or the whole directory replaced). Returns the pruned ledger and
 * whether anything changed, so callers skip the write when it is a no-op.
 */
export function pruneProvenance(
  ledger: ProvenanceLedger,
  installedNames: readonly string[],
): { ledger: ProvenanceLedger; changed: boolean } {
  const installed = new Set(installedNames);
  const skills = Object.fromEntries(
    Object.entries(ledger.skills).filter(([name]) => installed.has(name)),
  );
  const changed = Object.keys(skills).length !== Object.keys(ledger.skills).length;
  return { ledger: changed ? { ...ledger, skills } : ledger, changed };
}

// ---------------------------------------------------------------- persistence

/** localStorage key holding the ledger in the browser (dev server / tests). */
const BROWSER_STORAGE_KEY = "skill-one.provenance";

async function saveProvenanceLedger(ledger: ProvenanceLedger): Promise<void> {
  if (isTauri()) {
    await writeProvenanceRaw(JSON.stringify(ledger, null, 2));
    return;
  }
  localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(ledger));
}

async function loadProvenanceLedger(): Promise<ProvenanceLedger> {
  if (isTauri()) {
    return parseProvenanceLedger(await readProvenanceRaw());
  }
  return parseProvenanceLedger(localStorage.getItem(BROWSER_STORAGE_KEY));
}

/**
 * Record where a freshly installed skill came from. Best-effort by contract:
 * a ledger write failure is logged and swallowed so it can never fail (or
 * slow down feedback for) the install it documents.
 */
export async function recordSkillProvenance(
  repo: string,
  slug: string,
  hash?: string,
): Promise<void> {
  try {
    const ledger = await loadProvenanceLedger();
    await saveProvenanceLedger(
      upsertProvenanceEntry(ledger, { repo, slug, hash }),
    );
  } catch (e) {
    console.warn("provenance: failed to record install source", e);
  }
}

/**
 * Forget a skill's provenance after uninstall. Best-effort like recording:
 * the ledger must never turn a removal into an error.
 */
export async function removeSkillProvenance(name: string): Promise<void> {
  try {
    const ledger = await loadProvenanceLedger();
    await saveProvenanceLedger(dropProvenanceEntry(ledger, name));
  } catch (e) {
    console.warn("provenance: failed to forget install source", e);
  }
}

/**
 * Record several freshly auto-linked skills in one read-modify-write pass —
 * the hash tier can match a handful of skills in one reconcile, and each of
 * them writing the file on its own would be N reads + N writes for what is
 * logically one ledger update.
 */
export async function recordSkillProvenanceBatch(
  entries: Array<{ repo: string; slug: string; hash?: string }>,
): Promise<void> {
  try {
    const ledger = await loadProvenanceLedger();
    let next = ledger;
    for (const entry of entries) next = upsertProvenanceEntry(next, entry);
    if (next !== ledger) await saveProvenanceLedger(next);
  } catch (e) {
    console.warn("provenance: failed to record install sources", e);
  }
}

/**
 * Reconcile the ledger with the on-disk truth and return the current
 * name→provenance map. Called whenever the installed list is (re)loaded, so
 * skills removed outside the app stop claiming a source, and so consumers —
 * the install buttons and the my-skills page — always read a fresh map.
 */
export async function reconcileProvenance(
  installedNames: readonly string[],
): Promise<Record<string, SkillProvenance>> {
  const { ledger, changed } = pruneProvenance(
    await loadProvenanceLedger(),
    installedNames,
  );
  if (changed) await saveProvenanceLedger(ledger);
  return ledger.skills;
}

// ------------------------------------------------- browser mock hooks (tests)

/**
 * Seed the browser ledger directly (dev server demos, tests). No-op inside
 * Tauri, where the real file is the only source of truth.
 */
export function seedMockProvenance(
  entries: Record<string, { repo: string; slug: string }>,
): void {
  if (isTauri()) return;
  const ledger = emptyProvenanceLedger();
  for (const [name, e] of Object.entries(entries)) {
    ledger.skills[name] = { ...e, installedAt: new Date().toISOString() };
  }
  localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(ledger));
}

/** Clear the browser ledger (test reset). No-op inside Tauri. */
export function resetMockProvenance(): void {
  if (isTauri()) return;
  localStorage.removeItem(BROWSER_STORAGE_KEY);
}
