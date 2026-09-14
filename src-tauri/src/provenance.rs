//! Provenance ledger: the app's own install-source record, stored as
//! `.skill-one.json` inside the global skills directory.
//!
//! `agents-skills` 0.13 dropped its lockfile, so an installed skill can no
//! longer be tied back to the repo it came from. This module restores the
//! association at the app level: after each successful install the frontend
//! appends a `{name -> {repo, slug, installedAt}}` entry here. The file is a
//! hidden dotfile without a SKILL.md, so the library's directory scan ignores
//! it and it never shows up as a skill.
//!
//! The backend stays thin — two file commands, no ledger schema knowledge.
//! Parsing, merging and pruning all happen in the frontend (`src/lib/provenance.ts`).

use std::path::Path;

/// The ledger file inside the global skills directory (`~/.agents/skills`).
const LEDGER_FILE: &str = ".skill-one.json";

/// Resolve the ledger path: `<home>/.agents/skills/.skill-one.json`. The
/// directory is the library's canonical global skills dir; the commands never
/// accept caller-controlled paths, so nothing else can be read or written.
fn ledger_path() -> Result<std::path::PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".agents").join("skills").join(LEDGER_FILE))
        .ok_or_else(|| "cannot resolve the home directory".to_string())
}

/// Read the raw ledger JSON. `None` (not an error) when the file does not
/// exist yet — the ledger is created lazily by the first install.
fn read_ledger_at(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(content) => Ok(Some(content)),
        // A missing file is the "no ledger yet" state, not a failure.
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("read {}: {e}", path.display())),
    }
}

/// Replace the ledger atomically: write a sibling temp file first, then
/// rename over the target, so a crash mid-write cannot leave a truncated
/// ledger behind (a torn file would just parse as empty, but the rename is
/// one syscall and cheap to do right).
fn write_ledger_at(path: &Path, content: &str) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("rename {}: {e}", tmp.display()))
}

/// Read the raw provenance ledger; `null` when it does not exist yet.
#[tauri::command]
pub async fn read_provenance() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| read_ledger_at(&ledger_path()?))
        .await
        .map_err(|e| format!("read provenance task failed: {e}"))?
}

/// Replace the provenance ledger with the given JSON content (written
/// atomically; the frontend owns the full document).
#[tauri::command]
pub async fn write_provenance(content: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || write_ledger_at(&ledger_path()?, &content))
        .await
        .map_err(|e| format!("write provenance task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn read_missing_ledger_yields_none() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert_eq!(read_ledger_at(&dir.path().join(LEDGER_FILE)).unwrap(), None);
    }

    #[test]
    fn read_write_roundtrip() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(LEDGER_FILE);
        write_ledger_at(&path, "{\"version\":1}").expect("write");
        assert_eq!(
            read_ledger_at(&path).unwrap().as_deref(),
            Some("{\"version\":1}")
        );
    }

    #[test]
    fn write_replaces_previous_content() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(LEDGER_FILE);
        write_ledger_at(&path, "old").expect("write");
        write_ledger_at(&path, "new").expect("write");
        assert_eq!(read_ledger_at(&path).unwrap().as_deref(), Some("new"));
    }

    #[test]
    fn write_leaves_no_temp_file_behind() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join(LEDGER_FILE);
        write_ledger_at(&path, "content").expect("write");
        let tmp = path.with_extension("tmp");
        assert!(
            !tmp.exists(),
            "temp file {} should be renamed away",
            tmp.display()
        );
        assert!(path.exists());
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
        let path = dir.path().join(LEDGER_FILE);
        fs::create_dir(&path).expect("create dir");
        assert!(read_ledger_at(&path).is_err());
    }
}
