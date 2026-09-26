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

/// Recursively collect `(relative path, bytes)` for every regular file under
/// `root`, relative paths separated by `/`. Symlinks are skipped (neither
/// followed nor hashed): install layouts may link between agent dirs, and a
/// cycle would loop forever.
fn collect_files(
    root: &Path,
    prefix: &str,
    out: &mut Vec<(String, Vec<u8>)>,
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
            collect_files(root, &rel, out)?;
        } else {
            let bytes = std::fs::read(entry.path())
                .map_err(|e| format!("read {}: {e}", entry.path().display()))?;
            out.push((rel, bytes));
        }
    }
    Ok(())
}

/// Compute the upstream hash of the skill directory at `root`. Fails when the
/// directory cannot be read; an empty directory hashes the empty input.
pub fn hash_skill_dir(root: &Path) -> Result<String, String> {
    let mut files = Vec::new();
    collect_files(root, "", &mut files)?;
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
    Ok(hex(&hasher.finalize()))
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
        assert_eq!(hash_skill_dir(dir.path()).unwrap(), EXPECTED);
    }

    #[test]
    fn hash_is_content_sensitive() {
        let dir = fixture();
        fs::write(dir.path().join("a.txt"), "changed").expect("rewrite");
        assert_ne!(hash_skill_dir(dir.path()).unwrap(), EXPECTED);
    }

    #[test]
    fn hash_is_path_sensitive() {
        // Renaming a file changes the hashed path bytes even with equal
        // content, so two differently-laid-out skills never collide.
        let dir = fixture();
        fs::rename(dir.path().join("B.txt"), dir.path().join("Z.txt")).expect("rename");
        assert_ne!(hash_skill_dir(dir.path()).unwrap(), EXPECTED);
    }

    #[test]
    fn case_only_renames_still_change_the_digest() {
        // `a.txt` → `A.txt` is a no-op for base collation *order*, but the
        // path bytes fed into the digest differ, so the hash must change.
        let dir = fixture();
        fs::rename(dir.path().join("a.txt"), dir.path().join("A.txt")).expect("rename");
        assert_ne!(hash_skill_dir(dir.path()).unwrap(), EXPECTED);
    }

    #[test]
    fn empty_dir_hashes_the_empty_input() {
        let dir = tempfile::tempdir().expect("tempdir");
        let empty = Sha256::digest([] as [u8; 0]);
        assert_eq!(hash_skill_dir(dir.path()).unwrap(), hex(&empty));
    }

    #[test]
    fn symlinks_are_skipped() {
        let dir = fixture();
        #[cfg(unix)]
        std::os::unix::fs::symlink(dir.path().join("a.txt"), dir.path().join("link.txt"))
            .expect("symlink");
        assert_eq!(hash_skill_dir(dir.path()).unwrap(), EXPECTED);
    }

    #[test]
    fn missing_dir_is_an_error() {
        let dir = tempfile::tempdir().expect("tempdir");
        assert!(hash_skill_dir(&dir.path().join("nope")).is_err());
    }
}
