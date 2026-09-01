import { useMemo } from "react";
import { useQueries, type QueryClient } from "@tanstack/react-query";
import { emit } from "@tauri-apps/api/event";

import { isTauri } from "../lib/tauri";
import { SKILLS_CHANGED_EVENT } from "../popover/popover-events";
import {
  fetchInstalledSkills,
  fetchSkillsInScope,
} from "../lib/local-skills";
import type { InstalledSkill } from "../lib/skills-manager";
import {
  GLOBAL_SCOPE,
  projectScope,
  type SkillScope,
} from "../lib/skill-scope";
import type { Project } from "../lib/projects";
import { useProjects } from "./use-projects";

/**
 * The TanStack Query cache-key prefix for installed-skill lists.
 *
 * Each scope's list lives under `[...PREFIX, scope]`; every consumer writes
 * (install / remove / toggle / move) and invalidates the bare `PREFIX`, which
 * react-query matches as a prefix by default — so one
 * `invalidateQueries({ queryKey: INSTALLED_SKILLS_QUERY_KEY })` refreshes the
 * global list, every project list, and the sidebar / popover counts at once.
 */
export const INSTALLED_SKILLS_QUERY_KEY = ["installed-skills"] as const;

/** The cache key for one scope's installed-skill list. */
export function installedSkillsKey(scope: SkillScope) {
  return [...INSTALLED_SKILLS_QUERY_KEY, scope] as const;
}

/**
 * An installed skill enriched with the scope it was read from. `scopeKey` is the
 * authoritative scope for operations on this row (a project row carries its real
 * directory), and `project` is the registered project for a project row, so the
 * UI can label the card and target the right project on a move.
 */
export interface ScopedInstalledSkill extends InstalledSkill {
  scopeKey: SkillScope;
  project?: Project;
}

/**
 * The merged installed-skills list: every global skill plus every skill of every
 * registered project, each tagged with its scope. Shared by the my-skills page,
 * the sidebar badge, the install buttons, and the popover — they all read the
 * same per-scope cache entries via the shared key prefix.
 */
export function useInstalledSkills() {
  const projects = useProjects();

  const scopes = useMemo<SkillScope[]>(
    () => [GLOBAL_SCOPE, ...projects.map((p) => projectScope(p.path))],
    [projects],
  );

  const results = useQueries({
    queries: scopes.map((scope) => ({
      queryKey: installedSkillsKey(scope),
      queryFn: () =>
        scope.kind === "global"
          ? fetchInstalledSkills()
          : fetchSkillsInScope(scope),
    })),
  });

  const data = useMemo<ScopedInstalledSkill[]>(() => {
    const merged: ScopedInstalledSkill[] = [];
    results.forEach((r, i) => {
      const scope = scopes[i];
      for (const skill of r.data ?? []) {
        if (scope.kind === "project") {
          const project = projects.find((p) => p.path === scope.path);
          merged.push({ ...skill, scopeKey: scope, project });
        } else {
          merged.push({ ...skill, scopeKey: GLOBAL_SCOPE });
        }
      }
    });
    return merged;
  }, [results, scopes, projects]);

  // Loading mirrors the original single-query contract: the page spins until
  // every scope has produced a first result. Any errored scope surfaces as a
  // page error (project dirs can genuinely fail), with the first failure's
  // message. Once loaded, background refetches stay silent.
  const isLoading = results.some((r) => r.isPending);
  const failed = results.find((r) => r.isError);

  return {
    data,
    isLoading,
    isError: Boolean(failed),
    error: failed?.error,
  };
}

/**
 * Broadcast that the installed-skills list changed to every other window.
 * Each window keeps its own query cache (the popover is a separate webview),
 * so invalidating only the local cache never reaches them. A no-op outside
 * Tauri so the browser / test environment stays silent.
 */
export function notifySkillsChanged(): void {
  if (isTauri()) void emit(SKILLS_CHANGED_EVENT);
}

/**
 * The single call every successful skill mutation should make: refresh this
 * window's cached list and notify the other windows. Returns the invalidation
 * promise so mutation success handlers can `await` it.
 */
export function markSkillsChanged(
  queryClient: QueryClient,
): Promise<void> {
  const invalidated = queryClient.invalidateQueries({
    queryKey: INSTALLED_SKILLS_QUERY_KEY,
  });
  notifySkillsChanged();
  return invalidated;
}
