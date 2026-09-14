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
 * The `Skill` shape the shared detail panel consumes, synthesized from the
 * installed record. `path` stays undefined, which makes the panel read the
 * SKILL.md from the local skills directory — the version the user actually
 * has. The repo comes from the provenance ledger when the app recorded the
 * install (filling in the owner avatar, source link and install-state
 * matching); skills installed by other tools keep the empty repo, which
 * hides the source the record cannot vouch for.
 */
export function detailSkillFor(
  skill: InstalledSkill,
  provenance?: Record<string, SkillProvenance>,
): Skill {
  return {
    name: skill.name,
    repo: provenance?.[skill.name]?.repo ?? "",
    description: skill.description ?? "",
    stars: 0,
    downloads: 0,
  };
}
