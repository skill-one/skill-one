/**
 * User-level agent link preferences, persisted in localStorage.
 *
 * Detected agents are linked automatically — the user never has to act — so
 * the on-disk state alone cannot distinguish "not linked yet" from "the user
 * chose to unlink this one". This exclusion list is that distinction: the
 * auto-link pass skips every agent on it, and the agent link settings dialog
 * toggles membership — unlinking an agent records it here, re-linking clears
 * it.
 *
 * Storage access follows the app-wide defensive pattern (see `cdn-config`):
 * a missing, full, or disabled backend falls back to an in-memory copy so a
 * read returns "no exclusions" and a write never breaks the caller.
 */

const STORAGE_KEY = "skill-one.excludedAgents";

// The in-memory fallback keeps a session's exclusions working even where
// localStorage is unavailable (Vitest's node runner, private browsing).
const memory = new Set<string>();

function readStored(): string[] {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.filter((name): name is string => typeof name === "string");
        }
        // A well-formed but non-array payload is just as unreadable as
        // broken JSON — fall through to the in-memory copy.
      } else {
        return [];
      }
    }
  } catch {
    // Unreadable or not JSON: fall through to the in-memory copy.
  }
  return [...memory];
}

function writeStored(names: string[]): void {
  memory.clear();
  names.forEach((name) => memory.add(name));
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(names));
    }
  } catch {
    // Out of quota or storage disabled: the in-memory copy stays the source
    // of truth for this session.
  }
}

/** Names of agents the user explicitly unlinked; auto-link skips them. */
export function getExcludedAgents(): string[] {
  return readStored();
}

/** Record that the user unlinked `name`; auto-link will not touch it again. */
export function excludeAgent(name: string): void {
  const names = readStored();
  if (!names.includes(name)) {
    writeStored([...names, name]);
  }
}

/** Clear the exclusion for `name`; auto-link owns the agent again. */
export function includeAgent(name: string): void {
  const names = readStored();
  if (names.includes(name)) {
    writeStored(names.filter((n) => n !== name));
  }
}
