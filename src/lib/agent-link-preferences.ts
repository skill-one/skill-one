import { storage } from "./storage";

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
 * The session keeps its own copy of the list on top of the persisted one,
 * because the two failure modes of a shared store would otherwise undo the
 * user's choice: a write the backend refuses (quota full, storage disabled)
 * simply never reaches the next read, and a payload this version cannot parse
 * would read back as "nothing excluded" and re-link what was just unlinked.
 * Both are re-settled by the first good write.
 */

const STORAGE_KEY = "skill-one.excludedAgents";

/** What the last successful write said, for as long as this session runs. */
let session: string[] = [];

function readStored(): string[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((name): name is string => typeof name === "string");
    }
    // A well-formed but non-array payload is just as unreadable as broken
    // JSON: fall through to the session's copy.
  } catch {
    // Unreadable: fall through to the session's copy.
  }
  return [...session];
}

function writeStored(names: string[]): void {
  session = [...names];
  storage.setItem(STORAGE_KEY, JSON.stringify(names));
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
