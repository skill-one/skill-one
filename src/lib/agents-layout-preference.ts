import { storage } from "./storage";

/**
 * The agents graph presentation the user chose.
 *
 * - `constellation` — Vogel golden-angle scatter around the hub (default).
 * - `columns` — the original balanced icon columns on the hub's two sides.
 *
 * Persisted in localStorage with a session fallback, the same guarded shape
 * as the agent-link preferences: a blocked write or an unreadable payload
 * never throws and never silently resets the user's choice.
 */
export type AgentsLayoutMode = "constellation" | "columns";

const STORAGE_KEY = "skill-one.agentsLayout";
const DEFAULT_MODE: AgentsLayoutMode = "constellation";
const MODES: readonly AgentsLayoutMode[] = ["constellation", "columns"];

/** What the last successful write said, for as long as this session runs. */
let session: AgentsLayoutMode | null = null;

function readStored(): AgentsLayoutMode {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw !== null && MODES.includes(raw as AgentsLayoutMode)) {
    return raw as AgentsLayoutMode;
  }
  // Unset, blocked or unreadable: the session's last good write wins, then
  // the default.
  return session ?? DEFAULT_MODE;
}

function writeStored(mode: AgentsLayoutMode): void {
  session = mode;
  storage.setItem(STORAGE_KEY, mode);
}

/** The user's chosen graph layout. */
export function getAgentsLayout(): AgentsLayoutMode {
  return readStored();
}

/** Persist the chosen graph layout. */
export function setAgentsLayout(mode: AgentsLayoutMode): void {
  writeStored(mode);
}
