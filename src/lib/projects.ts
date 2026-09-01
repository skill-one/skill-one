/**
 * The set of project directories the user has registered for project-scoped
 * installs.
 *
 * A "project" is just an absolute directory: `agents-skills` installs a
 * project-scoped skill into `<path>/.agents/skills` when it is invoked with that
 * directory as `cwd`. This store owns the list of such directories (add / remove
 * / rename) and persists it to `localStorage`, so the set survives app restarts.
 *
 * It is a tiny external store (not a React Query cache): reads are synchronous
 * and every surface that needs the list (the toolbar, a card's scope menu, the
 * aggregation hook) subscribes to the same instance via `useProjects`.
 */

export interface Project {
  /** Absolute project root directory. */
  path: string;
  /** Display name; defaults to the directory's basename. */
  name: string;
}

const STORAGE_KEY = "skillone:projects";

let cache: Project[] | null = null;
const listeners = new Set<() => void>();

function read(): Project[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as Project[]) : [];
  } catch {
    return [];
  }
}

function write(next: Project[]): void {
  cache = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode / quota): keep the in-memory copy
    // so the session still works; the list just won't survive a restart.
  }
  listeners.forEach((l) => l());
}

function current(): Project[] {
  if (cache === null) cache = read();
  return cache;
}

/** Derive a display name from a path: its last non-empty segment. */
export function nameFromPath(path: string): string {
  const clean = path.replace(/[/\\]+$/, "");
  const seg = clean.split(/[/\\]/).pop();
  return seg && seg.length > 0 ? seg : path;
}

/** The current project list (stable reference until the next mutation). */
export function listProjects(): Project[] {
  return current();
}

/** Register a project by directory; a repeat of an existing path is a no-op. */
export function addProject(path: string): Project {
  const existing = current().find((p) => p.path === path);
  if (existing) return existing;
  const project: Project = { path, name: nameFromPath(path) };
  write([...current(), project]);
  return project;
}

/** Drop a project from the list (does not touch its on-disk skills). */
export function removeProject(path: string): void {
  write(current().filter((p) => p.path !== path));
}

/** Rename how a project is displayed. */
export function renameProject(path: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  write(current().map((p) => (p.path === path ? { ...p, name: trimmed } : p)));
}

/** Clear all projects (used by tests and a "reset" affordance). */
export function resetProjects(): void {
  write([]);
}

/** Subscribe to list changes; returns an unsubscribe fn. For `useSyncExternalStore`. */
export function subscribeProjects(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** Snapshot getter for `useSyncExternalStore` (returns the stable cached ref). */
export function getProjectsSnapshot(): Project[] {
  return current();
}
