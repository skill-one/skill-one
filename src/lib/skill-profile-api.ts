import type { SkillProfileDetail } from "../types/skill";
import { fetchFirstText, fileCandidates, getProfilesTag } from "./cdn-config";

/**
 * Per-skill profile reader for the skills-profiles dataset: the five angle
 * files the detail drawer's 概述 tab renders (domain and persona already
 * ride along on the registry index entry, so they are not re-fetched).
 *
 * Fetches are pinned to the profiles tag recorded by the registry client
 * (`getProfilesTag`) — an immutable address, so a lagging CDN can only
 * serve the same snapshot's bytes — falling back to the mutable `dist`
 * branch before any snapshot has been recorded.
 *
 * Each angle is fetched independently and validated; a failed or
 * future-shaped file simply drops its section (all-optional
 * `SkillProfileDetail`) instead of failing the whole profile — profiles
 * are garnish, and partial is strictly better than none.
 */
export const PROFILES = {
  repo: "skill-one/skills-profiles",
  /** Fallback ref when no profiles tag has been recorded yet. */
  ref: "dist",
} as const;

/** The ref profile fetches are pinned to: the recorded tag, or `dist`. */
function profilesRef(): string {
  return getProfilesTag() || PROFILES.ref;
}

/** Fetch and validate one angle file; null when unreachable or malformed. */
async function fetchAngle<T>(
  id: string,
  angle: string,
  validate: (raw: unknown) => T | null,
): Promise<T | null> {
  try {
    const { text } = await fetchFirstText(
      fileCandidates({
        repo: PROFILES.repo,
        ref: profilesRef(),
        path: `skills/${id}/${angle}.json`,
      }),
    );
    return validate(JSON.parse(text));
  } catch {
    // Unreachable, not JSON, or failed validation: drop the section.
    return null;
  }
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const textList = (value: unknown): string[] | undefined =>
  Array.isArray(value) &&
  value.every((item) => typeof item === "string" && item.length > 0)
    ? (value as string[])
    : undefined;

function validateScenario(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  return text((raw as { text?: unknown }).text) ?? null;
}

function validateTaglines(raw: unknown): string[] | null {
  if (!raw || typeof raw !== "object") return null;
  return textList((raw as { taglines?: unknown }).taglines) ?? null;
}

interface RawIoPair {
  input?: unknown;
  output?: unknown;
}

function validateBlackbox(
  raw: unknown,
): SkillProfileDetail["blackbox"] | null {
  if (!raw || typeof raw !== "object") return null;
  const { function: fn, input_output: pairs } = raw as {
    function?: unknown;
    input_output?: unknown;
  };
  const inputOutput = Array.isArray(pairs)
    ? pairs
        .map((pair): { input: string; output: string } | null => {
          if (!pair || typeof pair !== "object") return null;
          const input = text((pair as RawIoPair).input);
          const output = text((pair as RawIoPair).output);
          return input && output ? { input, output } : null;
        })
        .filter((pair): pair is { input: string; output: string } => pair != null)
    : undefined;
  const fnText = text(fn);
  if (!fnText && !inputOutput?.length) return null;
  return { function: fnText ?? "", inputOutput: inputOutput ?? [] };
}

function validateWhitebox(
  raw: unknown,
): SkillProfileDetail["whitebox"] | null {
  if (!raw || typeof raw !== "object") return null;
  const { execution_flow: flow, mechanisms } = raw as {
    execution_flow?: unknown;
    mechanisms?: unknown;
  };
  const executionFlow = textList(flow);
  const mechanismList = textList(mechanisms);
  if (!executionFlow && !mechanismList) return null;
  return {
    executionFlow: executionFlow ?? [],
    mechanisms: mechanismList ?? [],
  };
}

interface RawComment {
  user?: unknown;
  category?: unknown;
  comment?: unknown;
}

function validateComments(raw: unknown): SkillProfileDetail["comments"] | null {
  const list = (raw as { comments?: unknown } | null)?.comments;
  if (!Array.isArray(list)) return null;
  const comments = list
    .map((entry): { user: string; category: string; comment: string } | null => {
      if (!entry || typeof entry !== "object") return null;
      const user = text((entry as RawComment).user);
      const category = text((entry as RawComment).category);
      const comment = text((entry as RawComment).comment);
      return user && category && comment ? { user, category, comment } : null;
    })
    .filter((entry): entry is { user: string; category: string; comment: string } => entry != null);
  return comments.length > 0 ? comments : null;
}

/**
 * Assemble a skill's full profile from the five angle files. `knownPath` is
 * the skill's directory inside the mirror snapshot
 * ("skills/{owner}/{repo}/{slug}") — the basename layout matches the
 * profiles dataset exactly, so the id is derived from it in one cut.
 * Throws only for skills without a mirror path (local installs — the caller
 * guards); every fetch failure inside merely drops its section.
 */
export async function fetchSkillProfile(
  skillId: string,
  knownPath?: string,
): Promise<SkillProfileDetail> {
  if (!knownPath) {
    throw new Error(`profile for ${skillId} not found: no mirror path`);
  }
  // "skills/{owner}/{repo}/{slug}" → "{owner}/{repo}/{slug}"
  const id = knownPath.replace(/^\/+/, "").replace(/^skills\//, "");
  const [scenario, taglines, blackbox, whitebox, comments] = await Promise.all([
    fetchAngle(id, "scenario", validateScenario),
    fetchAngle(id, "tagline", validateTaglines),
    fetchAngle(id, "blackbox", validateBlackbox),
    fetchAngle(id, "whitebox", validateWhitebox),
    fetchAngle(id, "comments", validateComments),
  ]);
  return {
    ...(scenario != null ? { scenario } : {}),
    ...(taglines != null ? { taglines } : {}),
    ...(blackbox != null ? { blackbox } : {}),
    ...(whitebox != null ? { whitebox } : {}),
    ...(comments != null ? { comments } : {}),
  };
}
