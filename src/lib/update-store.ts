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
//
// WHEN to check lives in the callers (startup + window focus + an hourly
// fallback, plus the manual button on the settings page); HOW OFTEN lives
// here: `checkForUpdate()` is throttled to one request per interval per
// session, so hopping between apps never triggers a burst. A manual check
// passes `{ force: true }` to bypass the window — asking is the point.
//
// Failure handling is deliberately asymmetric. A *background* failure is
// silent (nobody asked) and never retracts an update the user has already been
// told about; an explicit `force` check reports the error. Either way the
// throttle stamp is kept and the retry window doubles per consecutive failure,
// so an offline or otherwise hopeless install settles into a slow poll instead
// of firing one doomed request per focus hop.
//
// A Homebrew-managed bundle is refused outright: `brew upgrade` owns it, and
// replacing it in place would desync the cask (see update-channel.ts).

import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import { errorMessage } from "./utils";
import { isTauri } from "./tauri";
import { getUpdateChannel } from "./update-channel";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  /** Homebrew owns this install; the in-app updater stands down. */
  | "managed"
  | "error";

export interface UpdateStatus {
  phase: UpdatePhase;
  /** Version of the newly discovered release (`available` only). */
  version: string | null;
  /** Release notes of the newly discovered release (`available` only). */
  notes: string | null;
  /** Human-readable failure reason (`error` only). */
  error: string | null;
  /** Whether the confirmation dialog is open (only ever true on `available`). */
  dialogOpen: boolean;
}

const INITIAL: UpdateStatus = {
  phase: "idle",
  version: null,
  notes: null,
  error: null,
  dialogOpen: false,
};

/** Steady-state gap between two automatic update checks within one session. */
export const MIN_CHECK_INTERVAL_MS = 8 * 60 * 60 * 1000;

/**
 * How long `check()` may hang before the plugin gives up. Without it a single
 * stalled request would pin the store in `checking` — and `inFlight` — forever,
 * silently swallowing every later check.
 */
export const CHECK_TIMEOUT_MS = 15 * 1000;

/**
 * First backoff step after a failure, doubling per consecutive failure up to
 * {@link MIN_CHECK_INTERVAL_MS}. Short enough that a cold launch which raced
 * the network retries while the user is still looking at the app, long enough
 * that a permanently broken check stops being a per-focus request.
 */
export const FAILURE_BACKOFF_BASE_MS = 2 * 60 * 1000;

let status: UpdateStatus = INITIAL;
/** The discovered update object, kept until installed or superseded. */
let pending: Update | null = null;
/** When the last real check was issued; 0 = never (so startup always checks). */
let lastCheckedAt = 0;
/** Consecutive failures, driving the backoff. Reset by any successful check. */
let failureCount = 0;
/** Mutex: the phase only becomes `checking` after the channel probe settles,
 * which is far too late to stop a second caller from joining in. */
let inFlight = false;
/** True while downloading + installing: no check may clobber that state. */
let installing = false;

const listeners = new Set<() => void>();

function emit(patch: Partial<UpdateStatus>) {
  status = { ...status, ...patch };
  for (const notify of listeners) notify();
}

/** Throttle window for the next automatic check: the steady-state interval,
 * stretched by consecutive failures so a hopeless setup backs off instead of
 * hammering. */
function nextIntervalMs(): number {
  if (failureCount === 0) return MIN_CHECK_INTERVAL_MS;
  return Math.min(
    MIN_CHECK_INTERVAL_MS,
    FAILURE_BACKOFF_BASE_MS * 2 ** (failureCount - 1),
  );
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
 * Query the updater endpoint, at most once per {@link nextIntervalMs} unless
 * `force` is set. A no-op while another check is in flight, while an install is
 * running, or while the confirmation dialog is open — in the last two cases the
 * user is mid-decision and an `available` emit would tear the dialog away.
 *
 * A skipped call emits nothing. A failure surfaces through `error` only for a
 * forced check; background failures stay quiet and keep any update already
 * discovered on screen.
 */
export async function checkForUpdate(
  options: { force?: boolean } = {},
): Promise<void> {
  if (!isTauri()) {
    emit({ ...INITIAL, phase: "error", error: "自动更新仅在桌面应用内可用。" });
    return;
  }
  if (inFlight || installing || status.dialogOpen) return;
  // Throttle gate first: a skipped call must not emit anything.
  if (
    !options.force &&
    Date.now() - lastCheckedAt < nextIntervalMs()
  ) {
    return;
  }
  inFlight = true;
  emit({ ...INITIAL, phase: "checking" });
  try {
    // Homebrew installs are upgraded by brew: self-updating one would leave
    // the cask pointing at a version it does not have.
    if ((await getUpdateChannel()) === "homebrew") {
      emit({ ...INITIAL, phase: "managed" });
      return;
    }
    const update = await check({ timeout: CHECK_TIMEOUT_MS });
    lastCheckedAt = Date.now();
    failureCount = 0;
    if (!update) {
      pending = null;
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
    lastCheckedAt = Date.now();
    failureCount += 1;
    if (options.force) {
      // The user asked, so they get the reason. `pending` survives: the next
      // successful check puts the badge back.
      emit({ ...INITIAL, phase: "error", error: errorMessage(error) });
      return;
    }
    if (pending) {
      // A background hiccup must not retract an update we already announced.
      emit({
        ...INITIAL,
        phase: "available",
        version: pending.version,
        notes: pending.body || null,
      });
      return;
    }
    // Silent: nothing was asked for, and `error` is a settings-page affordance
    // the user never navigated to. The backoff covers the retry.
    emit({ ...INITIAL });
  } finally {
    inFlight = false;
  }
}

/** Open the confirmation dialog — only meaningful when an update is available. */
export function openUpdateDialog(): void {
  if (status.phase !== "available") return;
  emit({ dialogOpen: true });
}

/**
 * Hide the confirmation dialog while keeping the `available` phase, so the
 * sidebar badge stays put as a passive reminder the user can return to.
 */
export function closeUpdateDialog(): void {
  emit({ dialogOpen: false });
}

/**
 * Download + install the pending update, reporting progress as a 0–100
 * percentage — or `null` when the server sent no `Content-Length`, so the
 * dialog can label the wait instead of pinning a progress bar at 0% — then
 * relaunch the app. Throws on signature/network failures so the dialog can
 * offer a retry, and clears the `installing` latch so one does.
 */
export async function installUpdate(
  onProgress: (percent: number | null) => void,
): Promise<void> {
  if (!pending) return;
  installing = true;
  try {
    let total = 0;
    let received = 0;
    await pending.downloadAndInstall((event) => {
      switch (event.event) {
        case "Started":
          total = event.data.contentLength ?? 0;
          onProgress(total > 0 ? 0 : null);
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
  } finally {
    installing = false;
  }
}

/** Test seam: forget any pending update and reset to idle. */
export function resetUpdateState(): void {
  pending = null;
  status = INITIAL;
  lastCheckedAt = 0;
  failureCount = 0;
  inFlight = false;
  installing = false;
  for (const notify of listeners) notify();
}
