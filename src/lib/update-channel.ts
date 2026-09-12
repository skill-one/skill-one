// How this install is kept up to date. A Homebrew-managed bundle must not be
// replaced by the in-app updater: the cask would keep recording the version it
// installed, and `brew upgrade` would then fight the self-update (see
// `src-tauri/src/update_channel.rs` for the probe itself).
//
// The answer is memoised for the session — it cannot change while the app
// runs — and detection failure degrades to `self`, which is the behaviour every
// build had before this existed. A broken probe must never strand the user on
// an old version.

import { invoke } from "@tauri-apps/api/core";

import { isTauri } from "./tauri";

export type UpdateChannel = "self" | "homebrew";

let cached: UpdateChannel | null = null;
let inFlight: Promise<UpdateChannel> | null = null;

/** Resolve (and memoise) how this install is updated. */
export async function getUpdateChannel(): Promise<UpdateChannel> {
  if (!isTauri()) return "self";
  if (cached) return cached;
  if (!inFlight) {
    inFlight = invoke<boolean>("is_homebrew_install")
      .then((managed): UpdateChannel => (managed ? "homebrew" : "self"))
      .catch((): UpdateChannel => "self")
      .then((channel) => {
        cached = channel;
        return channel;
      });
  }
  return inFlight;
}

/** Test seam: forget the memoised channel. */
export function resetUpdateChannel(): void {
  cached = null;
  inFlight = null;
}
