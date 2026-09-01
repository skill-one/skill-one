import { useSyncExternalStore } from "react";

import {
  getProjectsSnapshot,
  subscribeProjects,
  type Project,
} from "../lib/projects";

/**
 * The registered project directories, reactive to add / remove / rename.
 *
 * Backed by the `projects` external store via `useSyncExternalStore` (the
 * snapshot getter returns a stable reference until the next mutation, so this
 * never re-renders on an unchanged list).
 */
export function useProjects(): Project[] {
  return useSyncExternalStore(
    subscribeProjects,
    getProjectsSnapshot,
    getProjectsSnapshot,
  );
}
