import { storage } from "./storage";

/**
 * How many skills a repository card lists before its footer's door is the only
 * way to the rest.
 *
 * A repository card is a summary, and the figure bounds its height: a repository
 * with one skill and one with fifty have to read as the same kind of object, so
 * the list grows with the repository only up to a point and then stops — the
 * footer always states the repository's total, so a capped list reads as "these
 * of them". How large that point is is a taste the reader sets in Settings: a
 * shorter preview keeps every card small, a longer one shows more of a
 * repository without opening it. Persisted in localStorage.
 */

const STORAGE_KEY = "skill-one.repoCardLimit";

/** The preview sizes the settings popover offers, smallest first. */
export const REPO_CARD_LIMITS = [3, 5, 7] as const;

export type RepoCardLimit = (typeof REPO_CARD_LIMITS)[number];

/** The size a reader who has not chosen one gets. */
export const DEFAULT_REPO_CARD_LIMIT: RepoCardLimit = 5;

function isLimit(value: number): value is RepoCardLimit {
  return (REPO_CARD_LIMITS as readonly number[]).includes(value);
}

const listeners = new Set<() => void>();

/**
 * The reader's chosen preview size. Anything unreadable — an unset key, or a
 * payload this version cannot parse — falls back to the default, exactly as a
 * blocked storage read does.
 */
export function getRepoCardLimit(): RepoCardLimit {
  const raw = storage.getItem(STORAGE_KEY);
  const parsed = raw === null ? Number.NaN : Number(raw);
  return isLimit(parsed) ? parsed : DEFAULT_REPO_CARD_LIMIT;
}

/** Persist the chosen preview size and notify any live readers. */
export function setRepoCardLimit(value: RepoCardLimit): void {
  storage.setItem(STORAGE_KEY, String(value));
  for (const listener of listeners) listener();
}

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribeRepoCardLimit(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
