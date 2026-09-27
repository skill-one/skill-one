//! The skills.sh upstream content hash, computed over a locally installed
//! skill directory.
//!
//! Algorithm (skills-sh-mirror `DEVELOPING.md`, "the upstream hash"):
//!
//! ```text
//! hash = sha256( concat over the skill's files, in case-insensitive path
//!                order: utf8(path relative to the skill root) + 0x00
//!                       + raw file bytes + 0x00 )
//! ```
//!
//! The order is not byte order: it is the base-strength ICU collation of the
//! relative paths (`Intl.Collator("en", { sensitivity: "base" })` upstream) —
//! byte-order sorting reproduces only ~40% of the published hashes, while the
//! collation reproduces ~99% (the rest are mirror fidelity exceptions: BOM
//! stripping, non-UTF-8 bytes, rewritten path characters).
//!
//! Used to auto-associate a locally installed skill (which carries no
//! install-source metadata) with its registry entry, whose `rev` is exactly
//! this hash for the indexed snapshot.
//!
//! The same walk also yields a [`DirFingerprint`] (latest mtime + total size):
//! the cheap change detector that lets the provenance ledger reuse a computed
//! hash across restarts without re-reading any bytes.

use std::path::Path;

use icu_collator::{options::CollatorOptions, options::Strength, Collator};
use sha2::{Digest, Sha256};

/// The base-strength collator matching `Intl.Collator("en", {sensitivity:
/// "base"})`: primary strength ignores case and accents, which is what the
/// upstream hash's file ordering uses. The root locale's tailoring is used —
/// at primary strength it orders file-name strings identically to `en`.
fn collator() -> icu_collator::CollatorBorrowed<'static> {
    let mut options = CollatorOptions::default();
    options.strength = Some(Strength::Primary);
    Collator::try_new(Default::default(), options)
        .expect("collator with compiled data is always constructible")
}

/// Recursively walk every regular file under `root`, calling `visit` with the
/// `/`-separated path relative to `root` and the directory entry. Symlinks are
/// skipped (neither followed nor visited): install layouts may link between
/// agent dirs, and a cycle would loop forever.
fn visit_files(
    root: &Path,
    prefix: &str,
    visit: &mut dyn FnMut(String, &std::fs::DirEntry) -> Result<(), String>,
) -> Result<(), String> {
    let entries = std::fs::read_dir(root.join(prefix))
        .map_err(|e| format!("read {}: {e}", root.join(prefix).display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("dir entry: {e}"))?;
        let file_type = entry
            .file_type()
            .map_err(|e| format!("file type {}: {e}", entry.path().display()))?;
        let rel = if prefix.is_empty() {
            entry.file_name().to_string_lossy().into_owned()
        } else {
            format!("{prefix}/{}", entry.file_name().to_string_lossy())
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            visit_files(root, &rel, visit)?;
        } else {
            visit(rel, &entry)?;
        }
    }
    Ok(())
}

/// Cheap content identity of a skill directory, accumulated during the same
/// walk that reads the hash's bytes: the latest file mtime (Unix ms) and the
/// total file size. A mismatch proves the content changed; a match *assumes*
/// it did not — mtime+size is a heuristic, which is exactly why the ledger
/// never trusts a fingerprint alone for linking (the hash still decides).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DirFingerprint {
    pub mtime_ms: f64,
    pub size: u64,
}

/// The content identity of one skill directory: the upstream hash (the exact
/// identity) plus the fingerprint (the cheap change detector for reusing it).
#[derive(Debug, Clone, PartialEq)]
pub struct SkillContent {
    pub hash: String,
    pub fingerprint: DirFingerprint,
}

/// Accumulate one file's stat into the fingerprint. Both walkers (the hashing
/// one and the stat-only one) share this so the two can never drift apart.
fn accumulate(meta: &std::fs::Metadata, fp: &mut DirFingerprint) -> Result<(), String> {
    fp.size += meta.len();
    if let Ok(modified) = meta.modified() {
        if let Ok(age) = modified.duration_since(std::time::UNIX_EPOCH) {
            fp.mtime_ms = fp.mtime_ms.max(age.as_secs_f64() * 1000.0);
        }
    }
    Ok(())
}

/// Stat-only fingerprint of the skill directory at `root` — no file bytes are
/// read. This is the cheap validity check for a stored [`SkillContent`].
pub fn fingerprint_skill_dir(root: &Path) -> Result<DirFingerprint, String> {
    let mut fingerprint = DirFingerprint {
        mtime_ms: 0.0,
        size: 0,
    };
    visit_files(root, "", &mut |_rel, entry| {
        let meta = entry
            .metadata()
            .map_err(|e| format!("stat {}: {e}", entry.path().display()))?;
        accumulate(&meta, &mut fingerprint)
    })?;
    Ok(fingerprint)
}

/// Compute the content identity of the skill directory at `root`: the upstream
/// hash plus the change-detection fingerprint, in one walk. Fails when the
/// directory cannot be read; an empty directory hashes the empty input.
pub fn analyze_skill_dir(root: &Path) -> Result<SkillContent, String> {
    let mut files = Vec::new();
    let mut fingerprint = DirFingerprint {
        mtime_ms: 0.0,
        size: 0,
    };
    visit_files(root, "", &mut |rel, entry| {
        let meta = entry
            .metadata()
            .map_err(|e| format!("stat {}: {e}", entry.path().display()))?;
        accumulate(&meta, &mut fingerprint)?;
        let bytes = std::fs::read(entry.path())
            .map_err(|e| format!("read {}: {e}", entry.path().display()))?;
        files.push((rel, bytes));
        Ok(())
    })?;
    let collator = collator();
    files.sort_by(|a, b| {
        collator.compare(&a.0, &b.0).then_with(|| a.0.cmp(&b.0)) // stable tiebreak for collation-equal paths
    });
    let mut hasher = Sha256::new();
    for (rel, bytes) in &files {
        hasher.update(rel.as_bytes());
        hasher.update([0x00]);
        hasher.update(bytes);
        hasher.update([0x00]);
    }
    Ok(SkillContent {
        hash: hex(&hasher.finalize()),
        fingerprint,
    })
}

/// Lowercase hex encoding: `sha2` 0.11's digest output no longer implements
/// `LowerHex`, so `format!("{:x}", ...)` from 0.10 is unavailable.
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
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

    /// Expected value produced by the reference algorithm in Node:
    /// `Intl.Collator("en", {sensitivity: "base"})` sorts a.txt, B.txt,
    /// C/d.md, SKILL.md; digest over `path + 0x00 + bytes + 0x00` each.
    const EXPECTED: &str = "a641a5575dab127d7773257cc21bdabdffec779df0ce70603ab99f0d5e387608";

    #[test]
    fn matches_the_reference_collation_order_and_digest() {
        let dir = fixture();
        assert_eq!(analyze_skill_dir(dir.path()).unwrap().hash, EXPECTED);
    }

    #[test]
    fn hash_is_content_sensitive() {
        let dir = fixture();
        fs::write(dir.path().join("a.txt"), "changed").expect("rewrite");
        assert_ne!(analyze_skill_dir(dir.path()).unwrap().hash, EXPECTED);
    }

    #[test]
    fn hash_is_path_sensitive() {
        // Renaming a file changes the hashed path bytes even with equal
        // content, so two differently-laid-out skills never collide.
        let dir = fixture();
        fs::rename(dir.path().join("B.txt"), dir.path().join("Z.txt")).expect("rename");
        assert_ne!(analyze_skill_dir(dir.path()).unwrap().hash, EXPECTED);
    }

    #[test]
    fn case_only_renames_still_change_the_digest() {
        // `a.txt` → `A.txt` is a no-op for base collation *order*, but the
        // path bytes fed into the digest differ, so the hash must change.
        let dir = fixture();
        fs::rename(dir.path().join("a.txt"), dir.path().join("A.txt")).expect("rename");
        assert_ne!(analyze_skill_dir(dir.path()).unwrap().hash, EXPECTED);
    }

    #[test]
    fn empty_dir_hashes_the_empty_input() {
        let dir = tempfile::tempdir().expect("tempdir");
        let empty = Sha256::digest([] as [u8; 0]);
        assert_eq!(analyze_skill_dir(dir.path()).unwrap().hash, hex(&empty));
    }

    #[test]
    fn symlinks_are_skipped() {
        let dir = fixture();
        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.path().join("a.txt"), dir.path().join("link.txt"))
            .expect("symlink");
        assert_eq!(analyze_skill_dir(dir.path()).unwrap().hash, EXPECTED);
    }

    #[test]
    fn missing_dir_is_an_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert!(analyze_skill_dir(&dir.path().join("nope")).is_err());
    }

    #[test]
    fn fingerprint_is_stable_while_content_is_unchanged() {
        let dir = fixture();
        let first = analyze_skill_dir(dir.path()).unwrap().fingerprint;
        let second = analyze_skill_dir(dir.path()).unwrap().fingerprint;
        assert_eq!(first, second);
        assert!(first.size > 0);
        assert!(first.mtime_ms > 0.0);
    }

    #[test]
    fn fingerprint_changes_on_edit_and_delete() {
        let dir = fixture();
        let before = analyze_skill_dir(dir.path()).unwrap().fingerprint;

        // An edit bumps the file's mtime (or, at equal mtime granularity, the
        // total size); a deletion changes the size either way.
        let file = dir.path().join("a.txt");
        let mut longer = fs::read(&file).expect("read a.txt");
        longer.extend_from_slice(b" and more");
        fs::write(&file, &longer).expect("rewrite a.txt");
        let edited = analyze_skill_dir(dir.path()).unwrap().fingerprint;
        assert_ne!(edited.size, before.size);

        fs::remove_file(&file).expect("remove a.txt");
        let deleted = analyze_skill_dir(dir.path()).unwrap().fingerprint;
        assert_ne!(deleted.size, edited.size);
    }
}
