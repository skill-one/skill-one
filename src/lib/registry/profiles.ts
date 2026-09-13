import {
  cacheBusted,
  fetchFirstText,
  fetchSignal,
  fileCandidates,
} from "../cdn-config";
import type { SkillProfile } from "../../types/skill";
import { isCanonicalId } from "./parse";
import { readLatestTag } from "./snapshot";
import type { SnapshotSource } from "./snapshot";

/**
 * Reader for the skill-one/skills-profiles dataset: the extra per-skill
 * metadata (domain classification, persona) merged on top of the registry
 * index. Runs inside the registry worker.
 *
 * The dataset publishes to its `dist` branch on the same pointer contract as
 * the registry index (see `snapshot.ts`): a `latest` file names the tag the
 * branch points at — `dist-<date>` for a day's baseline, `dist-<date>-N` for
 * the Nth batch generated on top of it. Tags are immutable and the repo keeps
 * a rolling month, so every file is fetched pinned to the pointer's tag; the
 * pointer read is cache-busted because it is a mutable address whose job is to
 * report freshness, and a pinned file URL never needs busting because its
 * bytes are content-addressed.
 */

/**
 * The skills-profiles repo publishes one JSONL line per profiled skill to
 * its `dist` branch (~100 KB for the current coverage — read whole, not
 * streamed).
 */
const PROFILES_SPEC = {
  repo: "skill-one/skills-profiles",
  path: "skills.jsonl",
  ref: "dist",
} as const;

/** Sidecar run stats published next to the profiles index. */
const PROFILES_META_SPEC = { ...PROFILES_SPEC, path: "stats.json" } as const;

/**
 * The profiles repo's pointer contract: the `latest` file at the `dist` root
 * names either a day's baseline tag (`dist-<date>`) or one of the batches
 * generated on top of it (`dist-<date>-N`).
 */
const PROFILES_SOURCE: SnapshotSource = {
  repo: PROFILES_SPEC.repo,
  branch: PROFILES_SPEC.ref,
  tag: /^dist-\d{4}-\d{2}-\d{2}(?:-\d+)?$/,
};

/**
 * Freshness and shape of the currently published profiles snapshot.
 * `generatedAt` (the snapshot's stamped `publishedAt`) is the identity the
 * controller compares its cache against — the publisher only stamps a snapshot
 * whose content actually changed, so equal stamps mean equal bytes.
 */
export interface ProfilesMeta {
  /** Immutable tag the profiles files can be fetched at; absent when unpinned. */
  tag?: string;
  /** The snapshot's `publishedAt` stamp (UTC). */
  generatedAt?: string;
}

interface RawProfilesStats {
  publishedAt?: unknown;
}

/** Normalize a stats payload; junk fields become `undefined`. */
function normalizeStats(raw: RawProfilesStats): ProfilesMeta {
  const stamp = raw.publishedAt;
  return {
    generatedAt:
      typeof stamp === "string" && stamp.length > 0 ? stamp : undefined,
  };
}

/** Read `stats.json` from each candidate in order; null when all fail. */
async function readProfilesStats(
  cdnBase: string,
  ref: string | undefined,
  busted: boolean,
): Promise<RawProfilesStats | null> {
  const spec = ref ? { ...PROFILES_META_SPEC, ref } : PROFILES_META_SPEC;
  for (const url of fileCandidates(spec, cdnBase)) {
    try {
      const resp = await fetch(busted ? cacheBusted(url) : url, {
        signal: fetchSignal(),
      });
      if (!resp.ok) continue;
      const stats: unknown = await resp.json();
      if (stats && typeof stats === "object") return stats as RawProfilesStats;
    } catch {
      // Unreachable, timed out, or not JSON: give the next source a turn.
    }
  }
  return null;
}

/**
 * Probe the currently published profiles snapshot, on the same pointer-first
 * strategy as the registry index: read the repo's `latest` file for the tag,
 * then read `stats.json` **pinned to that tag** — an immutable address, so a
 * lagging CDN can only serve the same snapshot's stats — for the publication
 * stamp.
 *
 * When the pointer cannot be read, the branch's own `stats.json` is probed
 * cache-busted for the stamp, which still detects a moved dataset but leaves
 * the fetch unpinned.
 *
 * Returns null when no source answered, which the caller treats as "cannot
 * check freshness" and skips the refresh rather than guessing.
 */
export async function probeProfilesMeta(
  cdnBase: string,
): Promise<ProfilesMeta | null> {
  const tag = await readLatestTag(cdnBase, PROFILES_SOURCE);
  if (tag) {
    const stats = await readProfilesStats(cdnBase, tag, false);
    return stats ? { ...normalizeStats(stats), tag } : { tag };
  }
  // Fallback: the mutable branch's stats, cache-busted so it cannot answer
  // for a publish that has already happened.
  const stats = await readProfilesStats(cdnBase, undefined, true);
  if (!stats) return null;
  const normalized = normalizeStats(stats);
  return normalized.generatedAt ? normalized : null;
}

/** One raw profiles JSONL line, as the dataset publishes it. */
interface RawProfileLine {
  /** Canonical skills.sh id, identical to the registry index's join key. */
  id: unknown;
  domain?: unknown;
  persona?: unknown;
}

/**
 * Validate one profiles line into the app's SkillProfile. The `id` must be
 * a canonical skills.sh id (it joins against the registry index) and the
 * domain must be a non-empty string — the only field a consumer actually
 * filters on. Everything else is optional garnish; a malformed line is
 * skipped entirely rather than carried as a half-profile.
 */
export function parseProfileLine(
  line: string,
): { id: string; profile: SkillProfile } | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let raw: RawProfileLine;
  try {
    raw = JSON.parse(trimmed) as RawProfileLine;
  } catch {
    return null;
  }
  if (typeof raw.id !== "string" || !isCanonicalId(raw.id)) return null;
  if (raw.domain == null || typeof raw.domain !== "object") return null;
  const { domain, reason } = raw.domain as { domain?: unknown; reason?: unknown };
  if (typeof domain !== "string" || domain.length === 0) return null;
  const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.length > 0 ? value : undefined;
  const persona =
    raw.persona && typeof raw.persona === "object"
      ? (raw.persona as Record<string, unknown>)
      : undefined;
  const shaped = persona
    ? {
        tool: text(persona.tool),
        role: text(persona.role),
        scene: text(persona.scene),
      }
    : undefined;
  return {
    id: raw.id,
    profile: {
      domain,
      reason: text(reason),
      persona:
        shaped && (shaped.tool || shaped.role || shaped.scene)
          ? shaped
          : undefined,
    },
  };
}

/**
 * Fetch the whole profiles index (~100 KB — read whole, not streamed) and
 * parse it into a map keyed by the canonical skills.sh id, the exact join
 * key of the registry index entries. `tag` pins the fetch to an immutable
 * snapshot; without one the mutable `dist` branch is read cache-busted.
 * Throws when no candidate could serve the file — the caller decides
 * whether that is survivable (it always is: profiles are garnish).
 */
export async function readProfiles(
  cdnBase: string,
  tag: string | undefined,
): Promise<Map<string, SkillProfile>> {
  const spec = { ...PROFILES_SPEC, ref: tag ?? PROFILES_SPEC.ref };
  const urls = fileCandidates(spec, cdnBase).map((url) =>
    tag ? url : cacheBusted(url),
  );
  const { text } = await fetchFirstText(urls);
  const profiles = new Map<string, SkillProfile>();
  for (const line of text.split("\n")) {
    const parsed = parseProfileLine(line);
    if (parsed) profiles.set(parsed.id, parsed.profile);
  }
  return profiles;
}
