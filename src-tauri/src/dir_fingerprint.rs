//! Stat-only change detection for an installed skill's directory.
//!
//! The provenance ledger caches a ranked list of source candidates per skill
//! and reuses it across restarts. That cache is only good while the directory
//! it was computed from is unchanged, and the cheapest honest answer to "has it
//! changed?" is stat-only: the latest file mtime plus the total size. No file
//! bytes are read.
//!
//! A mismatch proves the content changed. A match *assumes* it did not —
//! mtime+size is a heuristic — which is safe here because the cache it guards
//! is a suggestion, not an identity: a false "unchanged" can at worst show a
//! user a candidate list that is one edit out of date, and the confirmation is
//! theirs to make anyway.

use std::path::Path;

/// Cheap content identity of a skill directory, accumulated over one walk: the
/// latest file mtime (Unix ms) and the total file size.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DirFingerprint {
    pub mtime_ms: f64,
    pub size: u64,
}

/// Recursively walk every regular file under `root`, calling `visit` with the
/// `/`-separated path relative to `root` and the directory entry. Symlinks are
/// skipped (neither followed nor visited): install layouts may link between
/// agent dirs, and a cycle would loop forever.
fn visit_files(
    root: &Path,
    prefix: &str,
    visit: &mut dyn FnMut(&str, &std::fs::DirEntry) -> Result<(), String>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(root.join(prefix))
        .map_err(|e| format!("read {}: {e}", root.join(prefix).display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("file type {}: {e}", entry.path().display()))?;
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            let rel = if prefix.is_empty() {
                entry.file_name().to_string_lossy().into_owned()
            } else {
                format!("{prefix}/{}", entry.file_name().to_string_lossy())
            };
            visit_files(root, &rel, visit)?;
        } else {
            visit(prefix, &entry)?;
        }
    }
    Ok(())
}

/// Stat-only fingerprint of the skill directory at `root`. Fails when the
/// directory cannot be read; an empty directory fingerprints as zero.
pub fn fingerprint_skill_dir(root: &Path) -> Result<DirFingerprint, String> {
    let mut fingerprint = DirFingerprint {
        mtime_ms: 0.0,
        size: 0,
    };
    visit_files(root, "", &mut |_prefix, entry| {
        let meta = entry
            .metadata()
            .map_err(|e| format!("stat {}: {e}", entry.path().display()))?;
        fingerprint.size += meta.len();
        if let Ok(modified) = meta.modified() {
            if let Ok(age) = modified.duration_since(std::time::UNIX_EPOCH) {
                fingerprint.mtime_ms = fingerprint.mtime_ms.max(age.as_secs_f64() * 1000.0);
            }
        }
        Ok(())
    })?;
    Ok(fingerprint)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    /// Build a fixture directory; returns the temp dir handle.
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        fs::write(dir.path().join("B.txt"), "B").expect("write B.txt");
        fs::write(dir.path().join("a.txt"), "a").expect("write a.txt");
        fs::create_dir(dir.path().join("C")).expect("mkdir C");
        fs::write(dir.path().join("C/d.md"), "d").expect("write C/d.md");
        fs::write(
            dir.path().join("SKILL.md"),
            "---\nname: t\ndescription: t\n---\n",
        )
        .expect("write SKILL.md");
        dir
    }

    #[test]
    fn fingerprint_is_stable_while_content_is_unchanged() {
        let dir = fixture();
        let first = fingerprint_skill_dir(dir.path()).expect("fingerprint");
        let second = fingerprint_skill_dir(dir.path()).expect("fingerprint");
        assert_eq!(first, second);
        assert!(first.size > 0);
        assert!(first.mtime_ms > 0.0);
    }

    #[test]
    fn fingerprint_counts_nested_files_and_skips_symlinks() {
        let dir = fixture();
        let before = fingerprint_skill_dir(dir.path()).expect("fingerprint");

        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.path().join("a.txt"), dir.path().join("link.txt"))
            .expect("symlink");

        // The link is neither followed nor counted, so a link farm cannot
        // inflate the fingerprint into a permanent "changed" verdict.
        assert_eq!(
            fingerprint_skill_dir(dir.path()).expect("fingerprint"),
            before
        );
    }

    #[test]
    fn fingerprint_changes_on_edit_and_delete() {
        let dir = fixture();
        let before = fingerprint_skill_dir(dir.path()).expect("fingerprint");

        // An edit bumps the file's mtime (or, at equal mtime granularity, the
        // total size); a deletion changes the size either way.
        let file = dir.path().join("a.txt");
        let mut longer = fs::read(&file).expect("read a.txt");
        longer.extend_from_slice(b" and more");
        fs::write(&file, &longer).expect("rewrite a.txt");
        let edited = fingerprint_skill_dir(dir.path()).expect("fingerprint");
        assert_ne!(edited.size, before.size);

        fs::remove_file(&file).expect("remove a.txt");
        let deleted = fingerprint_skill_dir(dir.path()).expect("fingerprint");
        assert_ne!(deleted.size, edited.size);
    }

    #[test]
    fn an_empty_directory_fingerprints_as_zero() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert_eq!(
            fingerprint_skill_dir(dir.path()).expect("fingerprint"),
            DirFingerprint {
                mtime_ms: 0.0,
                size: 0
            }
        );
    }

    #[test]
    fn missing_dir_is_an_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert!(fingerprint_skill_dir(&dir.path().join("nope")).is_err());
    }
}
