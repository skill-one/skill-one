import type { SkillProvenance } from "./provenance";
import type { InstalledSkill } from "./skills-manager";
import type { Skill } from "../types/skill";

/**
 * The one adapter between the installed record and the shared skill surfaces.
 *
 * The store's rows and the installed list's rows are the same card fed from
 * two sources: the registry hands over a complete `Skill`, while the installed
 * list has an on-disk record (`InstalledSkill`) plus whatever the provenance
 * ledger remembers about where it came from. Everything that translation
 * involves lives here, so the card and the detail drawer cannot drift apart on
 * how an unrecorded install is labelled or on what the drawer is shown.
 */

/**
 * What a skill surface calls a skill the app has no recorded source for:
 * installed by another tool, or placed into the global directory by hand.
 * Shared by the card's source line and the drawer's subtitle.
 */
export const LOCAL_SOURCE_LABEL = "本地安装";

/**
 * A `Skill` as the shared surfaces render it, plus the one fact the data cannot
 * express on its own: whether the registry actually backs it.
 *
 * The store's own rows always are backed — the index they came from *is* the
 * registry. Two callers set it explicitly, both for the same reason: an
 * installed record no store entry resolved for, and a live skills.sh hit, which
 * is by definition not in the index (that is why it is a separate section).
 * Each must show no figures at all rather than a hardcoded zero — `stars: 0`
 * cannot tell "the source reports nothing" from "there is no source", and a
 * fabricated zero would contradict the store's card, which shows the real
 * number.
 *
 * So an absent `storeBacked` means "backed" (every plain `Skill` from the
 * registry), and only those two callers set it.
 */
/**
 * The identity a skill carries across every surface: store rows, the installed
 * list and the detail drawer's prev/next walk all address a skill by its repo
 * plus slug, which is unique on both sides of the index. Selecting by this
 * rather than by a position in a list is what lets a drawer stay on the skill
 * the reader opened while the list behind it regroups, streams in or shrinks.
 */
export function skillKey(skill: { repo: string; name: string }): string {
  return `${skill.repo}/${skill.name}`;
}

/**
 * Whether a skill view is a live skills.sh hit — the one unbacked shape that
 * is not an install.
 *
 * The two unbacked shapes read differently on the shared cards: an installed
 * record the store cannot resolve is a local fact (its empty description is
 * a real "has none", and nothing classifying it is a real 未分类), while a
 * live hit is upstream data the endpoint simply does not carry — no
 * description, no classification, nothing the card could claim. The cards
 * use this to draw a live row as what it is: a name, a source and an install
 * button, with no placeholder standing in for facts nobody established.
 *
 * The test is structural: the installed adapter always sets `installedAt`
 * (null included — see `installedSkillView`), so only a live hit leaves it
 * off. It is a `SkillView` predicate rather than a field precisely so the
 * two producers cannot drift on what a live row looks like.
 */
export function isLiveSkill(skill: SkillView): boolean {
  return skill.storeBacked === false && skill.installedAt === undefined;
}

export interface SkillView extends Skill {
  /**
   * False for a skill no store entry backs: an installed record the registry
   * holds no entry for, or a live skills.sh hit.
   */
  storeBacked?: boolean;
  /**
   * Installed skills only: when the skill's directory landed on disk, as Unix
   * seconds (UTC) — absent for registry-only rows and for filesystems that
   * record no creation time (agents-skills 0.16).
   */
  installedAt?: number | null;
}

/**
 * The `Skill` the shared card and detail panel render for an installed skill,
 * synthesized from the record, the ledger, and the store entry the ledger's
 * source resolved to.
 *
 * `path` stays undefined, which makes the panel read the SKILL.md from the local
 * skills directory — the version the user actually has, never the mirror's. The
 * repo comes from the provenance ledger when the app recorded the install
 * (filling in the owner avatar, source link and install-state matching); skills
 * installed by other tools keep the empty repo, which hides the source the
 * record cannot vouch for.
 *
 * The store entry is what lets the installed list show the same card the store
 * does: the domain chip and the install count are registry facts an on-disk
 * record never carries. It is absent whenever the ledger has no source for the
 * skill or the registry no longer lists it, and `storeBacked` keeps that
 * absence readable rather than turning it into a zero.
 */
export function installedSkillView(
  skill: InstalledSkill,
  provenance?: Record<string, SkillProvenance>,
  entry?: Skill,
): SkillView {
  return {
    name: skill.name,
    repo: provenance?.[skill.name]?.repo ?? "",
    description: skill.description,
    stars: entry?.stars ?? 0,
    downloads: entry?.downloads ?? 0,
    // The one fact only the on-disk record carries (agents-skills 0.16): when
    // the skill landed. A store row has no local install to read it from, so
    // the drawer shows it for installed skills only.
    installedAt: skill.installedAt ?? null,
    ...(entry?.profile ? { profile: entry.profile } : {}),
    storeBacked: entry != null,
  };
}
