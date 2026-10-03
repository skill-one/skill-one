//! Activity log: an append-only record of the app's impactful operations,
//! stored as JSONL in the OS log directory.
//!
//! Unlike the provenance ledger (`provenance.rs`), which is a last-wins state
//! snapshot keyed by skill name, this file is an event stream: every line is
//! one operation, order matters, and nothing is ever overwritten. The frontend
//! owns the schema and the tolerance policy (`src/lib/activity.ts`); this
//! module stays thin — resolve the path, append, tail-read, rotate and open
//! the directory.
//!
//! The file lives in `<app_log_dir>/activity.jsonl` (macOS:
//! `~/Library/Logs/<bundle-identifier>/`). The commands never accept a
//! caller-controlled path, so only this file is ever touched.

use std::io::Write;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// The log file inside the OS log directory (`app_log_dir()`).
const LOG_FILE: &str = "activity.jsonl";
/// The single rotated backup, kept when the log outgrows `MAX_BYTES`.
const ROTATED_FILE: &str = "activity.jsonl.1";
/// Rotate once the active file reaches this size (2 MiB).
const MAX_BYTES: u64 = 2 * 1024 * 1024;
/// Default tail size for `read_activity` when the caller sends none.
const DEFAULT_LIMIT: u32 = 500;

/// Resolve the activity log path: `<app_log_dir>/activity.jsonl`.
fn activity_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_log_dir()
        .map(|dir| dir.join(LOG_FILE))
        .map_err(|e| format!("resolve log dir: {e}"))
}

/// The sibling rotated backup for a given log path.
fn rotated_path(path: &Path) -> PathBuf {
    path.with_file_name(ROTATED_FILE)
}

/// Move the active log aside once it reaches the cap, replacing any older
/// backup, so the file never grows without bound. A missing file is a no-op.
fn rotate_if_needed(path: &Path) -> Result<(), String> {
    let len = match std::fs::metadata(path) {
        Ok(meta) => meta.len(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("stat {}: {e}", path.display())),
    };
    if len < MAX_BYTES {
        return Ok(());
    }
    let rotated = rotated_path(path);
    // Replace the previous backup, then move the current log into its place.
    match std::fs::remove_file(&rotated) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
        Err(e) => return Err(format!("remove {}: {e}", rotated.display())),
    }
    std::fs::rename(path, &rotated).map_err(|e| format!("rotate {}: {e}", path.display()))
}

/// Append one JSON record as a single line, creating the parent directory and
/// rotating first when the log has reached the cap. The caller sends one
/// record with no trailing newline (`JSON.stringify` never emits a raw one).
fn append_line_at(path: &Path, line: &str) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("no parent for {}", path.display()))?;
    std::fs::create_dir_all(parent).map_err(|e| format!("create {}: {e}", parent.display()))?;
    rotate_if_needed(path)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|e| format!("open {}: {e}", path.display()))?;
    file.write_all(line.as_bytes())
        .and_then(|_| file.write_all(b"\n"))
        .map_err(|e| format!("append {}: {e}", path.display()))
}

/// Read the newest `limit` lines, oldest-first, skipping blank lines. The
/// rotated backup (if any) is read first so a tail that crosses a rotation
/// still reads in chronological order. A missing file yields an empty tail.
fn read_tail_at(path: &Path, limit: usize) -> Result<Vec<String>, String> {
    let mut lines: Vec<String> = Vec::new();
    for candidate in [rotated_path(path), path.to_path_buf()] {
        match std::fs::read_to_string(&candidate) {
            Ok(content) => lines.extend(
                content
                    .lines()
                    .filter(|l| !l.trim().is_empty())
                    .map(str::to_string),
            ),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("read {}: {e}", candidate.display())),
        }
    }
    if lines.len() > limit {
        lines.drain(0..lines.len() - limit);
    }
    Ok(lines)
}

/// Append one activity record (a single JSON line) to the log.
#[tauri::command]
pub async fn append_activity(app: AppHandle, line: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || append_line_at(&activity_path(&app)?, &line))
        .await
        .map_err(|e| format!("append activity task failed: {e}"))?
}

/// Read the newest activity lines (oldest-first), at most `limit` (default
/// 500). Parsing is the frontend's job; this returns raw lines.
#[tauri::command]
pub async fn read_activity(app: AppHandle, limit: Option<u32>) -> Result<Vec<String>, String> {
    let limit = limit.unwrap_or(DEFAULT_LIMIT) as usize;
    tauri::async_runtime::spawn_blocking(move || read_tail_at(&activity_path(&app)?, limit))
        .await
        .map_err(|e| format!("read activity task failed: {e}"))?
}

/// Delete the activity log and its rotated backup. A missing file is a no-op.
#[tauri::command]
pub async fn clear_activity(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = activity_path(&app)?;
        for target in [rotated_path(&path), path] {
            match std::fs::remove_file(&target) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(format!("remove {}: {e}", target.display())),
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("clear activity task failed: {e}"))?
}

/// Reveal the activity log's directory in the system file manager, creating it
/// first so the action never fails on a fresh install.
#[tauri::command]
pub async fn open_activity_dir(app: AppHandle) -> Result<(), String> {
    let dir = activity_path(&app)?
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "no log directory".to_string())?;
    tauri::async_runtime::spawn_blocking(move || {
        std::fs::create_dir_all(&dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
        tauri_plugin_opener::open_path(&dir, None::<&str>)
            .map_err(|e| format!("open {}: {e}", dir.display()))
    })
    .await
    .map_err(|e| format!("open activity dir task failed: {e}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn paths(dir: &Path) -> (PathBuf, PathBuf) {
        (dir.join(LOG_FILE), dir.join(ROTATED_FILE))
    }

    #[test]
    fn append_creates_the_parent_dir_and_round_trips() {
        let dir = tempfile::tempdir().expect("tempdir");
        let target = dir.path().join("nested").join(LOG_FILE);
        append_line_at(&target, "{\"a\":1}").expect("append");
        append_line_at(&target, "{\"a\":2}").expect("append");
        assert_eq!(
            read_tail_at(&target, 10).unwrap(),
            vec!["{\"a\":1}", "{\"a\":2}"]
        );
    }

    #[test]
    fn read_missing_file_yields_an_empty_tail() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (active, _) = paths(dir.path());
        assert!(read_tail_at(&active, 10).unwrap().is_empty());
    }

    #[test]
    fn read_tail_keeps_the_newest_lines() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (active, _) = paths(dir.path());
        for n in 1..=5 {
            append_line_at(&active, &format!("line-{n}")).expect("append");
        }
        assert_eq!(read_tail_at(&active, 2).unwrap(), vec!["line-4", "line-5"]);
    }

    #[test]
    fn read_tail_skips_blank_lines() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (active, _) = paths(dir.path());
        fs::write(&active, "one\n\n  \ntwo\n").expect("write");
        assert_eq!(read_tail_at(&active, 10).unwrap(), vec!["one", "two"]);
    }

    #[test]
    fn rotation_moves_the_old_log_aside_and_starts_fresh() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (active, rotated) = paths(dir.path());
        fs::write(&active, "a".repeat(MAX_BYTES as usize)).expect("write");
        append_line_at(&active, "fresh").expect("append");
        assert!(rotated.exists(), "the old log should be moved aside");
        assert_eq!(fs::read_to_string(&active).unwrap(), "fresh\n");
    }

    #[test]
    fn a_new_rotation_replaces_the_previous_backup() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (active, rotated) = paths(dir.path());
        fs::write(&active, "a".repeat(MAX_BYTES as usize)).expect("write");
        append_line_at(&active, "first").expect("append");
        fs::write(&active, "b".repeat(MAX_BYTES as usize)).expect("write");
        append_line_at(&active, "second").expect("append");
        assert_eq!(fs::read_to_string(&active).unwrap(), "second\n");
        assert!(
            fs::read_to_string(&rotated).unwrap().starts_with('b'),
            "the backup should be the previous active log"
        );
    }

    #[test]
    fn tail_reads_across_a_rotation() {
        let dir = tempfile::tempdir().expect("tempdir");
        let (active, rotated) = paths(dir.path());
        fs::write(&rotated, "old-1\nold-2\n").expect("write");
        fs::write(&active, "new-1\n").expect("write");
        // The backup precedes the active file: all three in order...
        assert_eq!(
            read_tail_at(&active, 3).unwrap(),
            vec!["old-1", "old-2", "new-1"]
        );
        // ...and a tighter tail drops from the front.
        assert_eq!(read_tail_at(&active, 2).unwrap(), vec!["old-2", "new-1"]);
    }

    #[test]
    fn a_directory_in_place_of_the_log_is_an_error() {
        // Not NotFound, so an error — the frontend degrades to an empty log.
        let dir = tempfile::tempdir().expect("tempdir");
        let (active, _) = paths(dir.path());
        fs::create_dir(&active).expect("create dir");
        assert!(read_tail_at(&active, 10).is_err());
    }
}
