// Self-update state store — a tiny external store so the global
// UpdateDialog and the settings page share one source of truth without
// context plumbing. Update state is deliberately outside React Query: the
// flow is a multi-step imperative one (check, then download with progress,
// then relaunch), not a read-once query.
//
// The real work is done by the official updater plugin: `check()` fetches the
// endpoint declared in tauri.conf.json (GitHub Releases `latest.json`), and
// `downloadAndInstall()` verifies the minisign signature before installing.
// No Apple Developer account is involved: updates are trusted by this key,
// and the downloaded bundle carries no quarantine attribute.

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import { errorMessage } from "./utils";
import { isTauri } from "./tauri";

export type UpdatePhase = "idle" | "checking" | "upToDate" | "available" | "error";

export interface UpdateStatus {
  phase: UpdatePhase;
  /** Version of the newly discovered release (`available` only). */
  version: string | null;
  /** Release notes of the newly discovered release (`available` only). */
  notes: string | null;
  /** Human-readable failure reason (`error` only). */
  error: string | null;
}

const INITIAL: UpdateStatus = {
  phase: "idle",
  version: null,
  notes: null,
  error: null,
};

let status: UpdateStatus = INITIAL;
/** The discovered update object, kept until installed or superseded. */
let pending: Update | null = null;

const listeners = new Set<() => void>();

function emit(patch: Partial<UpdateStatus>) {
  status = { ...status, ...patch };
  for (const notify of listeners) notify();
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

export function subscribeUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Query the updater endpoint once. Concurrent calls are ignored; failures
 * surface through the `error` phase (network errors included) so the UI can
 * show an inline hint instead of throwing.
 */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri()) {
    emit({ ...INITIAL, phase: "error", error: "自动更新仅在桌面应用内可用。" });
    return;
  }
  if (status.phase === "checking") return;
  emit({ ...INITIAL, phase: "checking" });
  try {
    const update = await check();
    if (!update) {
      emit({ ...INITIAL, phase: "upToDate" });
      return;
    }
    pending = update;
    emit({
      ...INITIAL,
      phase: "available",
      version: update.version,
      notes: update.body || null,
    });
  } catch (error) {
    pending = null;
    emit({ ...INITIAL, phase: "error", error: errorMessage(error) });
  }
}

/** Close the update dialog; the pending update stays until the next check. */
export function dismissUpdate(): void {
  emit({ ...INITIAL });
}

/**
 * Download + install the pending update, reporting progress as a 0–100
 * percentage, then relaunch the app. Throws on signature/network failures so
 * the dialog can offer a retry.
 */
export async function installUpdate(
  onProgress: (percent: number) => void,
): Promise<void> {
  if (!pending) return;
  let total = 0;
  let received = 0;
  await pending.downloadAndInstall((event) => {
    switch (event.event) {
      case "Started":
        total = event.data.contentLength ?? 0;
        onProgress(0);
        break;
      case "Progress":
        received += event.data.chunkLength;
        // Cap at 99 until Finished: the install step still runs afterwards.
        if (total > 0) {
          onProgress(Math.min(99, Math.round((received / total) * 100)));
        }
        break;
      case "Finished":
        onProgress(100);
        break;
    }
  });
  await relaunch();
}

/** Test seam: forget any pending update and reset to idle. */
export function resetUpdateState(): void {
  pending = null;
  status = INITIAL;
  for (const notify of listeners) notify();
}
