//! Provenance ledger: the app's own install-source record, stored as
//! `.skill-one.jsonl` inside the global skills directory.
//!
//! `agents-skills` 0.13 dropped its lockfile, so an installed skill can no
//! longer be tied back to the repo it came from. This module restores the
//! association at the app level: after each successful install the frontend
//! writes one JSON line per skill (its install source, or the cached result
//! of its failed source matching). The file is a hidden dotfile without a
//! SKILL.md, so the library's directory scan ignores it and it never shows up
//! as a skill.
//!
//! The backend stays thin — two file commands, no ledger schema knowledge.
//! Parsing, merging and pruning all happen in the frontend (`src/lib/provenance.ts`).
//!
//! Migration: an older app version stored the ledger as one JSON document
//! (`.skill-one.json`). Reading falls back to that file while it exists; the
//! first successful write of the new format removes it.

use std::path::Path;

/// The ledger file inside the global skills directory (`~/.agents/skills`).
const LEDGER_FILE: &str = ".skill-one.jsonl";
/// The pre-JSONL ledger document, read until the first write supersedes it.
const LEGACY_FILE: &str = ".skill-one.json";

/// Resolve the ledger path: `<home>/.agents/skills/.skill-one.jsonl`. The
/// directory is the library's canonical global skills dir; the commands never
/// accept caller-controlled paths, so nothing else can be read or written.
fn ledger_path() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".agents").join("skills").join(LEDGER_FILE))
        .ok_or_else(|| "cannot resolve the home directory".to_string())
}

/// Resolve the legacy (pre-JSONL) ledger path, read during migration.
fn legacy_path() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".agents").join("skills").join(LEGACY_FILE))
        .ok_or_else(|| "cannot resolve the home directory".to_string())
}

/// Read the raw ledger. `None` (not an error) when neither file exists — the
/// ledger is created lazily by the first install. While the legacy JSON
/// document is still around (and the JSONL file is not), its content is
/// returned so the frontend can convert it; the first write then drops it.
fn read_ledger_at(ledger: &Path, legacy: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(ledger) {
        Ok(content) => Ok(Some(content)),
        // A missing file is the "no ledger yet" state, not a failure.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            match std::fs::read_to_string(legacy) {
                Ok(content) => Ok(Some(content)),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(format!("read {}: {e}", legacy.display())),
            }
        }
        Err(e) => Err(format!("read {}: {e}", ledger.display())),
    }
}

/// Replace the ledger atomically: write a sibling temp file first, then
/// rename over the target, so a crash mid-write cannot leave a truncated
/// ledger behind (a torn file would just parse as empty, but the rename is
/// one syscall and cheap to do right). Once the new-format ledger exists, a
/// leftover legacy document is removed — its content is either converted or
/// degraded already.
fn write_ledger_at(ledger: &Path, legacy: &Path, content: &str) -> Result<(), String> {
    let tmp = ledger.with_extension("tmp");
    std::fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, ledger).map_err(|e| format!("rename {}: {e}", tmp.display()))?;
    match std::fs::remove_file(legacy) {
        Ok(()) | Err(_) => Ok(()),
    }
}

/// Read the raw provenance ledger; `null` when it does not exist yet.
#[tauri::command]
pub async fn read_provenance() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| read_ledger_at(&ledger_path()?, &legacy_path()?))
        .await
        .map_err(|e| format!("read provenance task failed: {e}"))?
}

/// Replace the provenance ledger with the given JSON content (written
/// atomically; the frontend owns the full document).
#[tauri::command]
pub async fn write_provenance(content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        write_ledger_at(&ledger_path()?, &legacy_path()?, &content)
    })
    .await
    .map_err(|e| format!("write provenance task failed: {e}"))?
}

/// Reveal the ledger's directory (the global skills directory) in the system
/// file manager, creating it first so the action never fails on a fresh
/// install. The developer viewer's escape hatch to the raw file.
#[tauri::command]
pub async fn open_provenance_dir() -> Result<(), String> {
    let dir = ledger_path()?
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "no skills directory".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        tauri_plugin_opener::open_path(&dir, None::<&str>)
            .map_err(|e| format!("open {}: {e}", dir.display()))
    })
    .await
    .map_err(|e| format!("open provenance dir task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn paths(dir: &Path) -> (std::path::PathBuf, std::path::PathBuf) {
        (dir.join(LEDGER_FILE), dir.join(LEGACY_FILE))
    }

    #[test]
    fn read_missing_ledger_yields_none() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (ledger, legacy) = paths(dir.path());
        assert_eq!(read_ledger_at(&ledger, &legacy).unwrap(), None);
    }

    #[test]
    fn read_write_roundtrip() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (ledger, legacy) = paths(dir.path());
        write_ledger_at(&ledger, &legacy, "line").expect("write");
        assert_eq!(
            read_ledger_at(&ledger, &legacy).unwrap().as_deref(),
            Some("line")
        );
    }

    #[test]
    fn write_replaces_previous_content() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (ledger, legacy) = paths(dir.path());
        write_ledger_at(&ledger, &legacy, "old").expect("write");
        write_ledger_at(&ledger, &legacy, "new").expect("write");
        assert_eq!(
            read_ledger_at(&ledger, &legacy).unwrap().as_deref(),
            Some("new")
        );
    }

    #[test]
    fn write_leaves_no_temp_file_behind() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (ledger, legacy) = paths(dir.path());
        write_ledger_at(&ledger, &legacy, "content").expect("write");
        let tmp = ledger.with_extension("tmp");
        assert!(
            !tmp.exists(),
            "temp file {} should be renamed away",
            tmp.display()
        );
        assert!(ledger.exists());
    }

    #[test]
    fn missing_jsonl_falls_back_to_the_legacy_document() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (ledger, legacy) = paths(dir.path());
        fs::write(&legacy, "{\"version\":1}").expect("write legacy");
        assert_eq!(
            read_ledger_at(&ledger, &legacy).unwrap().as_deref(),
            Some("{\"version\":1}")
        );
    }

    #[test]
    fn first_write_removes_the_converted_legacy_document() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (ledger, legacy) = paths(dir.path());
        fs::write(&legacy, "{\"version\":1}").expect("write legacy");
        write_ledger_at(&ledger, &legacy, "line").expect("write");
        assert!(ledger.exists());
        assert!(
            !legacy.exists(),
            "legacy {} should be gone",
            legacy.display()
        );
    }

    #[test]
    fn ledger_path_sits_in_the_global_skills_dir() {
        let path = ledger_path().expect("home dir available in tests");
        assert!(path.starts_with(dirs::home_dir().unwrap()));
        assert_eq!(path.file_name().unwrap(), LEDGER_FILE);
        assert_eq!(path.parent().unwrap().file_name().unwrap(), "skills");
    }

    #[test]
    fn read_errors_on_a_broken_entry() {
        // A path that exists but is a directory: not NotFound, so an error —
        // the frontend degrades to an empty ledger.
        let dir = tempfile::tempdir().expect("tempdir");
        let (ledger, legacy) = paths(dir.path());
        fs::create_dir(&ledger).expect("create dir");
        assert!(read_ledger_at(&ledger, &legacy).is_err());
    }
}
