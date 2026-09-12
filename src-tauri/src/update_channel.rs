//! Where this install's updates come from.
//!
//! A Homebrew-managed bundle must not be replaced by the in-app updater: the
//! cask would keep recording the version it installed, and `brew upgrade` would
//! then fight the self-update. The frontend asks once per session and gates the
//! whole update flow on the answer (`src/lib/update-channel.ts`).

use std::path::Path;

/// Caskroom roots: the Homebrew prefixes for Apple Silicon and Intel.
const CASKROOM_ROOTS: [&str; 2] = ["/opt/homebrew/Caskroom", "/usr/local/Caskroom"];

/// Whether `skill-one` came from the Homebrew cask. Keyed on the cask's own
/// directory, which Homebrew creates on install and removes on uninstall — so a
/// bundle copied out of the Caskroom reports `false` and updates in-app.
#[tauri::command]
pub fn is_homebrew_install() -> bool {
    CASKROOM_ROOTS
        .iter()
        .any(|root| Path::new(root).join("skill-one").is_dir())
}
