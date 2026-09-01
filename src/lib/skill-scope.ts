/**
 * The scope a skill lives in: either the user-level **global** directory or a
 * specific **project** directory.
 *
 * This is the frontend's single notion of "where a skill is installed", shared
 * by the data access layer (`local-skills`), the mock store, and the UI (scope
 * filter, per-card scope menu, project manager). The backend expresses the same
 * thing as the pair `{ global, cwd }`, so `toBackendArgs` is the one mapping
 * between the two representations.
 */

/** Global = the user-level `~/.agents/skills`; project = `<path>/.agents/skills`. */
export type SkillScope =
  | { kind: "global" }
  | { kind: "project"; path: string };

/** The default install scope: new skills land globally. */
export const GLOBAL_SCOPE: SkillScope = { kind: "global" };

/** Convenience constructor for a project scope. */
export function projectScope(path: string): SkillScope {
  return { kind: "project", path };
}

/** Map a scope to the `{ global, cwd }` pair the Tauri commands accept. */
export function toBackendArgs(scope: SkillScope): {
  global: boolean;
  cwd?: string;
} {
  return scope.kind === "global"
    ? { global: true }
    : { global: false, cwd: scope.path };
}

/**
 * Recover a skill's scope from the absolute `path` reported by `list`.
 *
 * A global skill's path sits under the home `.agents/skills`; a project skill's
 * under `<project>/.agents/skills`. Because the backend also flags `scope`, the
 * `declared` argument disambiguates, and for a project we recover the project
 * root by cutting the path just before the `/.agents/` segment.
 */
export function scopeFromSkill(
  skill: { scope: "global" | "project"; path: string },
): SkillScope {
  if (skill.scope === "global") return GLOBAL_SCOPE;
  const marker = "/.agents/";
  const i = skill.path.indexOf(marker);
  if (i > 0) return projectScope(skill.path.slice(0, i));
  // A `project` skill with no recognisable `.agents` segment: fall back to the
  // skills dir's parent so at least removal targets a stable, non-empty cwd.
  return projectScope(skill.path.replace(/[/\\]skills[/\\].*$/, ""));
}

/** Whether two scopes point at the same install location. */
export function isSameScope(a: SkillScope, b: SkillScope): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind === "global" || (b.kind === "project" && a.path === b.path);
}
