import {
  cacheBusted,
  fetchFirstText,
  fetchSignal,
  fileCandidates,
} from "../cdn-config";
import type { SkillProfile } from "../../types/skill";
import { isCanonicalId } from "./parse";

/**
 * Reader for the skill-one/skills-profiles dataset: the extra per-skill
 * metadata (domain classification, persona) merged on top of the registry
 * index. Runs inside the registry worker.
 *
 * The dataset publishes to its `dist` branch and tags every batch
 * `dist-<date>` (a day's baseline) or `dist-<date>-N` (the Nth batch on top
 * of that baseline). Tags are immutable and the repo keeps a rolling month,
 * so — like the registry index — the freshest tag is listed first and every
 * file is fetched pinned to it; the tag-list walk is cache-busted because it
 * is a mutable pointer whose job is to report freshness, and a pinned file
 * URL never needs busting because its bytes are content-addressed.
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
 * Tag-listing endpoints, tried in order: the GitHub REST API is
 * authoritative and the jsDelivr data API mirrors it for users who cannot
 * reach `api.github.com`. Neither depends on the configured CDN base — a
 * file CDN cannot list refs. `per_page=100` is the API maximum and covers
 * the rolling-month window of `dist-*` tags in one page.
 */
const PROFILES_TAG_LIST_URLS = [
  `https://api.github.com/repos/${PROFILES_SPEC.repo}/tags?per_page=100`,
  `https://data.jsdelivr.com/v1/packages/gh/${PROFILES_SPEC.repo}`,
] as const;

/** A tag name upstream CI publishes: `dist-` + date, optionally `-N`. */
const PROFILES_TAG = /^dist-(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;

/**
 * Compare two `dist-<date>[-N]` tag names by their true order. Lexical
 * comparison lies twice here: `-10` sorts before `-2`, and the bare
 * baseline `dist-<date>` (batch 0) sorts after `-1`. Both are fixed by
 * comparing the date as a string (ISO dates order correctly) and the batch
 * number numerically, defaulting to 0 when absent.
 */
export function compareProfilesTags(a: string, b: string): number {
  const parse = (tag: string) => {
    const match = PROFILES_TAG.exec(tag);
    return match ? { date: match[1], batch: Number(match[2] ?? 0) } : null;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return 0;
  return left.date.localeCompare(right.date) || left.batch - right.batch;
}

/** Extract the newest `dist-*` tag name from a list of tag names. */
export function newestProfilesTag(names: string[]): string | undefined {
  const tags = names.filter((name) => PROFILES_TAG.test(name));
  if (tags.length === 0) return undefined;
  // The endpoints sort newest first, but neither documents the collation —
  // and batch tags (`-N`) break naive string order anyway — so sort here.
  return tags.toSorted(compareProfilesTags).at(-1);
}

/** Collect the string values of `key` in a listing payload (or its `versions`). */
function listingValues(payload: unknown, key: "name" | "version"): string[] {
  if (Array.isArray(payload)) {
    return payload
      .filter(
        (entry): entry is Record<string, unknown> =>
          entry != null && typeof entry === "object",
      )
      .map((entry) => entry[key])
      .filter((value): value is string => typeof value === "string");
  }
  if (payload && typeof payload === "object") {
    const versions = (payload as Record<string, unknown>).versions;
    if (Array.isArray(versions)) return listingValues(versions, key);
  }
  return [];
}

/**
 * Freshness and shape of the currently published profiles snapshot.
 * `generatedAt` (the snapshot's `fetched_at`) is the freshness identity the
 * controller compares its cache against — equal stamps mean equal bytes.
 */
export interface ProfilesMeta {
  /** Immutable tag the profiles files can be fetched at; absent when unpinned. */
  tag?: string;
  /** The snapshot's `fetched_at` stamp (UTC). */
  generatedAt?: string;
}

interface RawProfilesStats {
  snapshot?: { ref?: unknown; fetched_at?: unknown };
}

/** Normalize a stats payload; junk fields become `undefined`. */
function normalizeStats(raw: RawProfilesStats): ProfilesMeta {
  const stamp =
    typeof raw.snapshot?.fetched_at === "string" &&
    raw.snapshot.fetched_at.length > 0
      ? raw.snapshot.fetched_at
      : undefined;
  const ref =
    typeof raw.snapshot?.ref === "string" && PROFILES_TAG.test(raw.snapshot.ref)
      ? raw.snapshot.ref
      : undefined;
  return { tag: ref, generatedAt: stamp };
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
 * Probe the currently published profiles snapshot, mirroring the registry
 * index's tag-first strategy: list the repo's tags, pick the newest, and
 * read `stats.json` pinned to it for the publication stamp. When no tag can
 * be resolved (both listing endpoints unreachable) the fallback reads
 * `stats.json` off the mutable `dist` branch cache-busted and takes its
 * `snapshot.ref` — how upstream CI names the batch tag — as the pin.
 *
 * Returns null when no source answered, which the caller treats as "cannot
 * check freshness" and skips the refresh rather than guessing.
 */
export async function probeProfilesMeta(
  cdnBase: string,
): Promise<ProfilesMeta | null> {
  // Tag-first: the freshest listed tag pins the stats read, so a lagging
  // CDN can only serve the same snapshot's stats (immutable address).
  for (const url of PROFILES_TAG_LIST_URLS) {
    try {
      const resp = await fetch(cacheBusted(url), { signal: fetchSignal() });
      if (!resp.ok) continue;
      const payload: unknown = await resp.json();
      const tag = newestProfilesTag([
        ...listingValues(payload, "name"),
        ...listingValues(payload, "version"),
      ]);
      if (!tag) continue;
      const stats = await readProfilesStats(cdnBase, tag, false);
      return stats ? normalizeStats(stats) : { tag };
    } catch {
      // Unreachable, timed out, or not JSON: give the next endpoint a turn.
    }
  }
  // Fallback: the mutable branch's stats, cache-busted so it cannot answer
  // for a publish that has already happened.
  const stats = await readProfilesStats(cdnBase, undefined, true);
  if (!stats) return null;
  const normalized = normalizeStats(stats);
  return normalized.tag || normalized.generatedAt ? normalized : null;
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
