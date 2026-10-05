import type { SkillProvenance } from "./provenance";
import type { InstalledSkill } from "./skills-manager";
import { isCanonicalId } from "./registry/parse";
import type { Skill } from "../types/skill";
import type { SourceLinkReason } from "./activity";

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
 * The name a skill surface shows. The slug is the identity, but the row may
 * carry the upstream frontmatter spelling alongside it (`displayName`) — shown
 * when present, since that is the name the skill was published under.
 */
export function skillDisplayName(skill: {
  name: string;
  displayName?: string;
}): string {
  return skill.displayName ?? skill.name;
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
 * use this to draw a live row as what it is: a name, a source and — when the
 * source is installable at all (see `isInstallableSkill`) — an install
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

/**
 * Whether the shared surfaces may offer the install action for a skill view.
 *
 * Installing hands the row's upstream id to agents-skills, which accepts
 * nothing but exactly the `owner/repo/slug` shape. Every row an install backs
 * qualifies — the registry carries the id on its index lines and the live
 * search on its hits. Only a live skills.sh hit can fall short: its `source`
 * can be a discovery domain rather than a GitHub repo (e.g. `open.feishu.cn`),
 * leaving an id the backend can only refuse — so that row is offered the way
 * out it actually has (its skills.sh page) instead of a button that can only
 * fail.
 */
export function isInstallableSkill(skill: SkillView): boolean {
  return !isLiveSkill(skill) || isCanonicalId(`${skill.repo}/${skill.name}`);
}

export interface SkillView extends Skill {
  /**
   * False for a skill no store entry backs: an installed record the registry
   * holds no entry for, or a live skills.sh hit.
   */
  storeBacked?: boolean;
  /**
   * Installation origin: "store" (Skill One store) or "local" (third-party install).
   */
  origin?: "store" | "local";
  /**
   * Tags assigned to this skill.
   */
  tags?: string[];
  /**
   * Installed skills only: how the recorded source was established —
   * `install` (this app installed the skill), `confirm` (the user picked the
   * source from candidates), or `description` (auto-linked). Absent for store
   * rows (which need no provenance) and for a ledger record written without it.
   */
  via?: SourceLinkReason;
  /**
   * Installed skills only: the source repos this skill's user has cut. The repo
   * stays among the namesake candidates — re-picking it is the user's own act
   * of re-identification — so every surface that offers that list marks it
   * rather than presenting a repo they already refused as if it were new.
   * Absent when nothing was cut.
   */
  cutRepos?: string[];
  /**
   * Installed skills only: when the skill's directory landed on disk, as Unix
   * seconds (UTC) — absent for registry-only rows and for filesystems that
   * record no creation time (agents-skills 0.16).
   */
  installedAt?: number | null;
  /**
   * Installed skills only: the registry entry's snapshot directory, kept
   * apart from `path` on purpose. `path` stays undefined so the detail panel
   * reads the English SKILL.md the user actually has on disk, while the
   * snapshot's Chinese page (`SKILL.zh.md`) is still reachable through this
   * — the one file a disk install has no local counterpart for.
   */
  snapshotPath?: string;
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
  cut?: readonly string[],
): SkillView {
  const ledger = provenance?.[skill.name];
  const origin: "store" | "local" =
    ledger?.origin ?? (ledger?.via === "install" ? "store" : "local");
  return {
    name: skill.name,
    // The display spelling is what agents-skills reports for this on-disk copy
    // (`display_name` since 0.26 — the frontmatter `name` as declared), shown
    // as returned rather than second-guessed against the slug or the store
    // entry. The id, by contrast, is a registry fact the entry alone carries.
    ...(skill.displayName ? { displayName: skill.displayName } : {}),
    ...(entry?.id ? { id: entry.id } : {}),
    repo: ledger?.repo ?? "",
    origin,
    tags: ledger?.tags,
    // How that source was established (`install` vs a confirmed or auto
    // link) — the fact that tells a store install from a linked third-party
    // copy on the shared surfaces.
    via: ledger?.via ?? (origin === "store" ? "install" : ledger?.repo ? "confirm" : undefined),
    // The repos this skill's user has cut, for the surfaces that offer its
    // namesake candidates to mark.
    ...(cut && cut.length > 0 ? { cutRepos: [...cut] } : {}),
    description: skill.description,
    // The translated description comes from the registry entry; the on-disk
    // record carries no translation.
    ...(entry?.descriptionZh ? { descriptionZh: entry.descriptionZh } : {}),
    stars: entry?.stars ?? 0,
    downloads: entry?.downloads ?? 0,
    // The one fact only the on-disk record carries (agents-skills 0.16): when
    // the skill landed. A store row has no local install to read it from, so
    // the drawer shows it for installed skills only.
    installedAt: skill.installedAt ?? null,
    ...(entry?.profile ? { profile: entry.profile } : {}),
    // The snapshot directory rides the entry alone, for the Chinese-page
    // fetch; `path` stays undefined so the English body still reads from disk.
    ...(entry?.path ? { snapshotPath: entry.path } : {}),
    storeBacked: entry != null,
  };
}
