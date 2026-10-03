//! Skills install / agent management, backed by the `agents-skills` library.
//!
//! Exposes the library's [`Manager`] facade as async Tauri commands. All blocking
//! work (GitHub downloads, install, link, hashing, ...) is offloaded to the
//! blocking thread pool.

use serde::Serialize;
use std::path::PathBuf;

use crate::dir_fingerprint;
use agents_skills::{AddRequest, AgentRequest, LinkOutcome, Manager, SelectionRequest};

/// The skills directory is the user-level **global** one (`~/.agents/skills`).
///
/// Since agents-skills 0.17 project-level scope is gone entirely: the library
/// no longer takes a `global` flag (every operation targets the canonical dir),
/// so neither does this app. Since 0.26 home resolution can fail, so
/// construction is fallible — surfaced as the command error string.
fn manager() -> Result<Manager, String> {
    Manager::new().map_err(|e| e.to_string())
}

/// Run a blocking manager operation off the async runtime (install, link,
/// hashing, ...), mapping a failed join to the command error string. `task`
/// names the operation for that message ("install", "list", ...). Every
/// command's backend work goes through here.
async fn run_blocking<T, F>(task: &str, f: F) -> Result<T, String>
where
    F: FnOnce(&Manager) -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager()?;
        f(&manager)
    })
    .await
    .map_err(|e| format!("{task} task failed: {e}"))?
}

// ============================ DTOs (serialized to the frontend) ============================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    /// The installed skill's slug (the SKILL.md frontmatter `name` slugified) —
    /// the identity `remove`/`disable`/`enable` select by. Since 0.26 the
    /// slug is the single identity; the on-disk directory name keeps the
    /// source repository's original directory name.
    pub skill: String,
    /// `true` when nothing was copied because a skill of the same slug is
    /// already installed (enabled or disabled): `add` never overwrites, so a
    /// repeat install is a no-op reported here, never a failure.
    pub skipped: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLinkResultDto {
    pub agent: String,
    pub display: String,
    pub status: String,
    /// Skills moved into the canonical dir (`linked`).
    pub adopted: Vec<String>,
    /// Non-skill entries moved into `.misc/<agent>/` inside the canonical dir
    /// (`linked`); they stay there for good — unlink does not move them back.
    pub quarantined: Vec<String>,
    /// Entries dropped because the canonical dir (or `disabled-skills`) already
    /// holds that name — the existing copy wins (`linked`).
    pub conflicts: Vec<String>,
    /// Refusal reason or error message (`refused`/`failed`).
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkResult {
    pub results: Vec<AgentLinkResultDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusDto {
    pub name: String,
    pub display: String,
    pub linked: bool,
    pub canonical: bool,
    /// Skills inside the agent's own skills dir. Only populated for unlinked,
    /// non-canonical agents: it surfaces what a link would adopt into the
    /// canonical dir. Empty for linked/canonical agents (they share the
    /// canonical dir, shown by `list`).
    pub internal_skills: Vec<String>,
    /// Non-skill entries (files, symlinks to non-directories) inside the
    /// agent's own skills dir. Same population rules as `internal_skills`; a
    /// link quarantines them into the canonical dir's `.misc/<agent>/`.
    pub internal_others: Vec<String>,
}

/// A listed skill, as the library reports it since 0.16.
///
/// `description` (single-line) and `installed_at` come straight from
/// `Manager::list` — the app no longer parses SKILL.md itself. Since 0.20 the
/// app's DTO carries no `path`; since 0.26 the library's `ListedSkill` gained
/// `display_name` and `path` (the slug is the identity and
/// `Manager::skill_dir` returns the scanned directory); this DTO passes the
/// display spelling through (the UI shows it when it differs from the slug)
/// while still omitting `path` — `name` remains the slug every selection
/// command matches on.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedSkillDto {
    pub name: String,
    /// The frontmatter `name` as declared — the display-only rendition of the
    /// same skill (casing and spaces the slug folds away).
    pub display_name: String,
    /// Single-line description from the on-disk SKILL.md frontmatter.
    pub description: String,
    pub enabled: bool,
    /// The skill directory's creation time as Unix seconds (UTC), when the
    /// platform/filesystem records one; `None` otherwise.
    pub installed_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillMdDto {
    /// Absolute path of the `SKILL.md` file on disk.
    pub path: String,
    /// Raw file content (frontmatter included) — parsed on the frontend.
    pub content: String,
}

// ============================ Conversion helpers ============================

/// Map a listed skill to the frontend DTO. A thin pass-through: since 0.16 the
/// library's `ListedSkill` carries the description itself, already folded onto
/// a single line, so there is nothing left to extract here.
fn listed_skill_dto(skill: agents_skills::ListedSkill) -> ListedSkillDto {
    ListedSkillDto {
        name: skill.name,
        display_name: skill.display_name,
        description: skill.description,
        enabled: skill.enabled,
        installed_at: skill.installed_at,
    }
}

/// Read an installed skill's `SKILL.md` from its directory on disk.
///
/// The frontend parses the content (the same frontmatter parser the store
/// detail view uses), so this stays a thin file read: resolve `SKILL.md`
/// inside the given skill dir and return the file path with its raw text.
fn read_skill_md_file(skill_dir: &std::path::Path) -> Result<SkillMdDto, String> {
    let file = skill_dir.join("SKILL.md");
    let content =
        std::fs::read_to_string(&file).map_err(|e| format!("read {}: {e}", file.display()))?;
    Ok(SkillMdDto {
        path: file.display().to_string(),
        content,
    })
}

/// Overwrite an installed skill's `SKILL.md` in place.
///
/// The write is atomic: the new text lands in a sibling temp file that is then
/// renamed over `SKILL.md`, so an interrupted write can never leave a
/// half-written file behind (a rename within one directory is atomic). The
/// reader's error style is reused (`write <path>: <cause>`).
fn write_skill_md_file(skill_dir: &std::path::Path, content: &str) -> Result<(), String> {
    let file = skill_dir.join("SKILL.md");
    let tmp = skill_dir.join("SKILL.md.tmp");
    std::fs::write(&tmp, content).map_err(|e| format!("write {}: {e}", tmp.display()))?;
    if let Err(e) = std::fs::rename(&tmp, &file) {
        // Never leave the temp file behind when the swap fails.
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("write {}: {e}", file.display()));
    }
    Ok(())
}

/// Map a library link outcome to the flat DTO the frontend consumes. Every
/// variant starts from the same empty base and fills only the fields it
/// carries, so per-status field sets stay aligned with the DTO docs.
///
/// Since 0.15 linking is one-way: `Linked` adopts the agent's skills into the
/// canonical dir and quarantines the rest, and `Unlinked` carries no payload
/// because nothing is restored any more.
fn agent_link_result(result: agents_skills::AgentLinkResult) -> AgentLinkResultDto {
    let mut dto = AgentLinkResultDto {
        agent: result.agent,
        display: result.display,
        status: String::new(),
        adopted: vec![],
        quarantined: vec![],
        conflicts: vec![],
        message: None,
    };
    match result.outcome {
        LinkOutcome::Linked {
            adopted,
            quarantined,
            conflicts,
        } => {
            dto.status = "linked".into();
            dto.adopted = adopted;
            dto.quarantined = quarantined;
            dto.conflicts = conflicts;
        }
        LinkOutcome::AlreadyLinked => dto.status = "alreadyLinked".into(),
        LinkOutcome::Refused { reason } => {
            dto.status = "refused".into();
            dto.message = Some(reason);
        }
        LinkOutcome::Skipped => dto.status = "skipped".into(),
        LinkOutcome::Failed { error } => {
            dto.status = "failed".into();
            dto.message = Some(error);
        }
        LinkOutcome::Unlinked => dto.status = "unlinked".into(),
        LinkOutcome::NotLinked => dto.status = "notLinked".into(),
    }
    dto
}

// ============================ Tests ============================

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::Path;
    use tempfile::tempdir;

    fn skill_dir_with(skill_md: &str) -> tempfile::TempDir {
        let dir = tempdir().expect("tempdir");
        fs::write(dir.path().join("SKILL.md"), skill_md).expect("write SKILL.md");
        dir
    }

    #[test]
    fn listed_skill_dto_passes_the_library_facts_through() {
        let dto = listed_skill_dto(agents_skills::ListedSkill {
            name: "pdf".into(),
            display_name: "pdf".into(),
            description: "读取 PDF 文件。".into(),
            path: "/home/user/.agents/skills/pdf".into(),
            enabled: true,
            installed_at: Some(1_760_000_000),
        });
        assert_eq!(dto.name, "pdf");
        assert_eq!(dto.display_name, "pdf");
        assert_eq!(dto.description, "读取 PDF 文件。");
        assert!(dto.enabled);
        assert_eq!(dto.installed_at, Some(1_760_000_000));
    }

    #[test]
    fn listed_skill_dto_keeps_a_missing_install_time() {
        // Some Linux filesystems record no directory creation time.
        let dto = listed_skill_dto(agents_skills::ListedSkill {
            name: "pdf".into(),
            display_name: "pdf".into(),
            description: "d".into(),
            path: "/home/user/.agents/skills/pdf".into(),
            enabled: false,
            installed_at: None,
        });
        assert!(!dto.enabled);
        assert_eq!(dto.installed_at, None);
    }

    #[test]
    fn read_skill_md_file_returns_path_and_raw_content() {
        let dir = skill_dir_with("---\nname: pdf\ndescription: d\n---\nbody");
        let dto = read_skill_md_file(dir.path()).expect("read");
        assert!(dto.path.ends_with("SKILL.md"));
        assert!(dto.content.starts_with("---\n"));
        assert!(dto.content.ends_with("body"));
    }

    #[test]
    fn read_skill_md_file_errors_when_missing() {
        let dir = tempdir().expect("tempdir");
        assert!(read_skill_md_file(dir.path()).is_err());
    }

    #[test]
    fn write_skill_md_file_round_trips_through_the_reader() {
        let dir = skill_dir_with("---\nname: pdf\n---\nold");
        write_skill_md_file(dir.path(), "---\nname: pdf\n---\nnew").expect("write");
        let dto = read_skill_md_file(dir.path()).expect("read");
        assert!(dto.content.starts_with("---\n"));
        assert!(dto.content.ends_with("new"));
    }

    #[test]
    fn write_skill_md_file_creates_a_missing_file() {
        let dir = tempdir().expect("tempdir");
        write_skill_md_file(dir.path(), "fresh").expect("write");
        let dto = read_skill_md_file(dir.path()).expect("read");
        assert_eq!(dto.content, "fresh");
    }

    #[test]
    fn write_skill_md_file_errors_when_the_dir_is_missing() {
        // A missing directory (not a permissions problem) fails portably.
        let dir = tempdir().expect("tempdir");
        let missing = dir.path().join("nope");
        assert!(write_skill_md_file(&missing, "x").is_err());
    }

    #[test]
    fn link_outcome_linked_maps_the_adoption_triple() {
        let dto = agent_link_result(agents_skills::AgentLinkResult {
            agent: "cursor".into(),
            display: "Cursor".into(),
            outcome: LinkOutcome::Linked {
                adopted: vec!["pdf".into()],
                quarantined: vec!["README.md".into()],
                conflicts: vec!["docx".into()],
            },
        });
        assert_eq!(dto.status, "linked");
        assert_eq!(dto.adopted, vec!["pdf"]);
        assert_eq!(dto.quarantined, vec!["README.md"]);
        assert_eq!(dto.conflicts, vec!["docx"]);
        assert!(dto.message.is_none());
    }

    #[test]
    fn link_outcome_refused_carries_only_the_reason() {
        let dto = agent_link_result(agents_skills::AgentLinkResult {
            agent: "cursor".into(),
            display: "Cursor".into(),
            outcome: LinkOutcome::Refused {
                reason: "the agent dir is a foreign symlink".into(),
            },
        });
        assert_eq!(dto.status, "refused");
        assert_eq!(
            dto.message.as_deref(),
            Some("the agent dir is a foreign symlink")
        );
        assert!(dto.adopted.is_empty());
        assert!(dto.quarantined.is_empty());
        assert!(dto.conflicts.is_empty());
    }

    #[test]
    fn link_outcome_unlinked_has_no_payload() {
        // Since 0.15 unlink restores nothing: adopted skills stay canonical.
        let dto = agent_link_result(agents_skills::AgentLinkResult {
            agent: "cursor".into(),
            display: "Cursor".into(),
            outcome: LinkOutcome::Unlinked,
        });
        assert_eq!(dto.status, "unlinked");
        assert!(dto.adopted.is_empty());
        assert!(dto.quarantined.is_empty());
        assert!(dto.conflicts.is_empty());
        assert!(dto.message.is_none());
    }

    #[test]
    fn link_outcome_not_linked_and_skipped_are_status_only() {
        for (outcome, expected) in [
            (LinkOutcome::NotLinked, "notLinked"),
            (LinkOutcome::Skipped, "skipped"),
            (LinkOutcome::AlreadyLinked, "alreadyLinked"),
        ] {
            let dto = agent_link_result(agents_skills::AgentLinkResult {
                agent: "cursor".into(),
                display: "Cursor".into(),
                outcome,
            });
            assert_eq!(dto.status, expected);
            assert!(dto.message.is_none());
        }
    }

    // ================= the frontend contract =================

    /// The DTO half of the contract, and the half nothing else checks.
    ///
    /// Every one of these structs is mirrored field-for-field by a hand-written
    /// interface in `src/lib/skills-manager.ts`. `#[serde(rename_all =
    /// "camelCase")]` is the only thing keeping the two spellings together, and
    /// a field renamed on this side without the other reaches the UI as
    /// `undefined` — silently, because no type in the project spans the
    /// boundary. The multi-word fields are the ones that can drift, since
    /// `internal_skills` and `internalSkills` are equally plausible spellings
    /// of the same idea.
    #[test]
    fn dtos_serialize_to_the_camel_case_keys_the_frontend_declares() {
        let cases = [
            (
                "InstallResult",
                serde_json::to_value(InstallResult {
                    skill: "pdf".into(),
                    skipped: true,
                }),
                serde_json::json!({ "skill": "pdf", "skipped": true }),
            ),
            (
                "AgentLinkResultDto",
                serde_json::to_value(AgentLinkResultDto {
                    agent: "cursor".into(),
                    display: "Cursor".into(),
                    status: "linked".into(),
                    adopted: vec!["pdf".into()],
                    quarantined: vec!["notes.md".into()],
                    conflicts: vec![],
                    message: None,
                }),
                serde_json::json!({
                    "agent": "cursor",
                    "display": "Cursor",
                    "status": "linked",
                    "adopted": ["pdf"],
                    "quarantined": ["notes.md"],
                    "conflicts": [],
                    "message": null,
                }),
            ),
            (
                "LinkResult",
                serde_json::to_value(LinkResult { results: vec![] }),
                serde_json::json!({ "results": [] }),
            ),
            (
                "AgentStatusDto",
                serde_json::to_value(AgentStatusDto {
                    name: "cursor".into(),
                    display: "Cursor".into(),
                    linked: false,
                    canonical: false,
                    internal_skills: vec!["pdf".into()],
                    internal_others: vec!["README.md".into()],
                }),
                serde_json::json!({
                    "name": "cursor",
                    "display": "Cursor",
                    "linked": false,
                    "canonical": false,
                    "internalSkills": ["pdf"],
                    "internalOthers": ["README.md"],
                }),
            ),
            (
                "ListedSkillDto",
                serde_json::to_value(ListedSkillDto {
                    name: "pdf".into(),
                    display_name: "PDF toolkit".into(),
                    description: "PDF documents.".into(),
                    enabled: true,
                    installed_at: Some(1_760_000_000),
                }),
                serde_json::json!({
                    "name": "pdf",
                    "displayName": "PDF toolkit",
                    "description": "PDF documents.",
                    "enabled": true,
                    "installedAt": 1_760_000_000,
                }),
            ),
            (
                "SkillMdDto",
                serde_json::to_value(SkillMdDto {
                    path: "/skills/pdf/SKILL.md".into(),
                    content: "body".into(),
                }),
                serde_json::json!({ "path": "/skills/pdf/SKILL.md", "content": "body" }),
            ),
            (
                "FingerprintDto",
                serde_json::to_value(FingerprintDto {
                    mtime_ms: 1_760_000_000_000.5,
                    size: 4096,
                }),
                serde_json::json!({ "mtimeMs": 1_760_000_000_000.5, "size": 4096 }),
            ),
        ];

        for (name, actual, expected) in cases {
            assert_eq!(
                actual.expect("serialize"),
                expected,
                "{name}'s serialized keys drifted from the TypeScript interface",
            );
        }
    }

    #[test]
    fn a_listed_skill_serializes_a_missing_install_time_as_null() {
        // The library reports `None` on filesystems that record no directory
        // creation time, and the TS interface declares it optional, so the wire
        // form has to be `null` rather than a missing key.
        let json = serde_json::to_value(ListedSkillDto {
            name: "pdf".into(),
            display_name: "pdf".into(),
            description: "d".into(),
            enabled: false,
            installed_at: None,
        })
        .expect("serialize");

        assert_eq!(json["installedAt"], serde_json::Value::Null);
    }

    // ================= the Tauri command layer =================

    // `run_blocking` is the untested half of every command: it owns a
    // `spawn_blocking` hop, an error string, and resolution of the real
    // `~/.agents` — none of which a unit test can or should touch. The logic
    // each command delegates to lives in a `*_in` function that takes the
    // `Manager` as an argument, so all of it is reachable against a sandboxed
    // one.

    /// A `Manager` rooted at `root` rather than at the real home.
    ///
    /// `probe_system_dirs(false)` is what makes this hermetic: agent detection
    /// otherwise probes well-known system locations such as `/Applications`, so
    /// a link test would otherwise depend on what is installed on whichever
    /// machine runs it.
    fn sandbox(root: &Path) -> Manager {
        Manager::builder()
            .home(root)
            .config(root)
            .cwd(root)
            .probe_system_dirs(false)
            .build()
            .expect("sandboxed manager")
    }

    /// Write a skill where the library scans for one, so a test can start from
    /// a known installed set. The library reads `<home>/.agents/skills` and
    /// parks into `<home>/.agents/disabled-skills`.
    fn seed(root: &Path, name: &str, description: &str) {
        let dir = root.join(".agents/skills").join(name);
        fs::create_dir_all(&dir).expect("create skill dir");
        fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: {description}\n---\n\n{name} body\n"),
        )
        .expect("write SKILL.md");
    }

    /// Write a skill into an agent's own directory, `<home>/.<agent>/skills` —
    /// the private content a link adopts into the canonical dir.
    fn seed_agent_skill(root: &Path, agent: &str, name: &str) {
        let dir = root.join(format!(".{agent}/skills")).join(name);
        fs::create_dir_all(&dir).expect("create agent skill dir");
        fs::write(
            dir.join("SKILL.md"),
            format!("---\nname: {name}\ndescription: from {agent}\n---\n\nbody\n"),
        )
        .expect("write agent SKILL.md");
    }

    #[test]
    fn list_installed_reports_every_scanned_skill() {
        let root = tempdir().expect("tempdir");
        seed(root.path(), "pdf", "PDF documents.");
        seed(root.path(), "docx", "Word documents.");
        let manager = sandbox(root.path());

        let mut listed = list_installed_in(&manager).expect("list");
        listed.sort_by(|a, b| a.name.cmp(&b.name));

        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].name, "docx");
        assert_eq!(listed[0].description, "Word documents.");
        assert!(listed[0].enabled, "a skill on disk is not parked");
        assert_eq!(listed[1].name, "pdf");
    }

    #[test]
    fn list_installed_is_empty_for_a_fresh_home() {
        let root = tempdir().expect("tempdir");
        assert!(list_installed_in(&sandbox(root.path()))
            .expect("list")
            .is_empty());
    }

    #[test]
    fn resolve_skill_dir_never_interpolates_a_name_into_a_path() {
        // The whole reason this goes through the scan: a name is looked up
        // against what is actually installed, so a traversal attempt has nothing
        // to resolve to. Interpolating instead would hand the frontend's name
        // straight to the filesystem.
        let root = tempdir().expect("tempdir");
        seed(root.path(), "pdf", "PDF documents.");
        let manager = sandbox(root.path());

        for name in ["../../etc", "..", ".", "", "nope", "PDF"] {
            assert_eq!(
                resolve_skill_dir(&manager, name).unwrap_err(),
                format!("skill {name} is not installed"),
                "{name:?} must not resolve to a directory",
            );
        }
    }

    #[test]
    fn resolve_skill_dir_reaches_an_installed_skill_and_a_parked_one() {
        let root = tempdir().expect("tempdir");
        seed(root.path(), "pdf", "PDF documents.");
        seed(root.path(), "docx", "Word documents.");
        let manager = sandbox(root.path());

        let enabled = resolve_skill_dir(&manager, "pdf").expect("enabled");
        assert!(
            enabled.ends_with(".agents/skills/pdf"),
            "{}",
            enabled.display()
        );

        // Parked skills have to stay reachable: the detail view and the editor
        // both read a disabled skill, and `open`/`write` resolve it the same way.
        set_enabled_in(&manager, Some(vec!["docx".into()]), false).expect("park docx");
        let parked = resolve_skill_dir(&manager, "docx").expect("parked");
        assert!(
            parked.ends_with(".agents/disabled-skills/docx"),
            "{}",
            parked.display(),
        );
    }

    #[test]
    fn read_and_write_skill_md_round_trip_through_the_resolver() {
        let root = tempdir().expect("tempdir");
        seed(root.path(), "pdf", "PDF documents.");
        let manager = sandbox(root.path());

        let written = "---\nname: pdf\ndescription: edited\n---\n\nnew body\n";
        write_skill_md_in(&manager, "pdf", written).expect("write");

        let read = read_skill_md_in(&manager, "pdf").expect("read");
        assert_eq!(read.content, written);
        assert!(read.path.ends_with("SKILL.md"), "{}", read.path);
    }

    #[test]
    fn write_skill_md_refuses_a_name_that_is_not_installed() {
        // The write is the dangerous direction: an unresolved name must not
        // become a path, or a crafted name would create a file anywhere.
        let root = tempdir().expect("tempdir");
        let manager = sandbox(root.path());

        assert_eq!(
            write_skill_md_in(&manager, "../escaped", "x").unwrap_err(),
            "skill ../escaped is not installed",
        );
        assert!(!root.path().join("escaped").exists());
    }

    #[test]
    fn set_enabled_parks_a_skill_and_brings_it_back() {
        let root = tempdir().expect("tempdir");
        seed(root.path(), "pdf", "PDF documents.");
        seed(root.path(), "docx", "Word documents.");
        let manager = sandbox(root.path());

        let parked = set_enabled_in(&manager, Some(vec!["pdf".into()]), false).expect("park pdf");
        assert_eq!(parked, ["pdf"]);
        assert!(root.path().join(".agents/disabled-skills/pdf").exists());
        assert!(!root.path().join(".agents/skills/pdf").exists());

        // Still listed either way — parking moves the directory, it does not
        // uninstall, so the Installed page keeps showing it.
        let listed = list_installed_in(&manager).expect("list");
        let pdf = listed.iter().find(|s| s.name == "pdf").expect("pdf listed");
        assert!(!pdf.enabled, "a parked skill lists as disabled");
        let docx = listed
            .iter()
            .find(|s| s.name == "docx")
            .expect("docx listed");
        assert!(docx.enabled, "the other skill is untouched");

        let restored =
            set_enabled_in(&manager, Some(vec!["pdf".into()]), true).expect("restore pdf");
        assert_eq!(restored, ["pdf"]);
        assert!(root.path().join(".agents/skills/pdf").exists());
        assert!(!root.path().join(".agents/disabled-skills/pdf").exists());
    }

    #[test]
    fn remove_reports_only_the_names_that_went() {
        let root = tempdir().expect("tempdir");
        seed(root.path(), "pdf", "PDF documents.");
        seed(root.path(), "docx", "Word documents.");
        let manager = sandbox(root.path());

        let mut gone =
            remove_in(&manager, Some(vec!["pdf".into(), "absent".into()])).expect("remove");
        gone.sort();

        assert_eq!(gone, ["pdf"], "an unknown name is not reported as removed");
        assert!(!root.path().join(".agents/skills/pdf").exists());
        assert_eq!(list_installed_in(&manager).expect("list").len(), 1);
    }

    #[test]
    fn remove_with_no_selection_removes_nothing() {
        // `skills: None` means "nothing was named", not "everything" — the
        // command always sends `all: false`, and this guards that.
        let root = tempdir().expect("tempdir");
        seed(root.path(), "pdf", "PDF documents.");
        let manager = sandbox(root.path());

        assert!(remove_in(&manager, None).expect("remove").is_empty());
        assert_eq!(list_installed_in(&manager).expect("list").len(), 1);
    }

    #[test]
    fn fingerprint_is_none_for_an_uninstalled_name_and_some_for_a_real_one() {
        // `None` is the caller's cue to re-rank from scratch, so a name that is
        // not installed must not be an error.
        let root = tempdir().expect("tempdir");
        seed(root.path(), "pdf", "PDF documents.");
        let manager = sandbox(root.path());

        assert!(
            fingerprint_in(&manager, "absent")
                .expect("absent")
                .is_none(),
            "an uninstalled name has no fingerprint, and says so rather than failing",
        );

        let fp = fingerprint_in(&manager, "pdf")
            .expect("fingerprint")
            .expect("a seeded skill has a fingerprint");
        assert!(fp.size > 0, "the seeded SKILL.md contributes its bytes");
    }

    #[test]
    fn install_copies_a_local_skill_and_skips_a_repeat() {
        // A local directory is one of the two source forms 0.26 accepts and the
        // only one that needs no network, so the install path is testable
        // offline even though the app itself always sends a GitHub id.
        //
        // The source directory's own name is what lands on disk — since 0.26
        // the directory keeps the source's name and only the *slug* is the
        // identity — so the fixture uses a plain, non-hidden name. A
        // `tempfile::TempDir` would not do: its random name starts with a dot,
        // and the library's own scan skips hidden directories, so the install
        // would succeed and then be invisible to `list`.
        let root = tempdir().expect("tempdir");
        let source_dir = root.path().join("pdf");
        fs::create_dir_all(&source_dir).expect("create source dir");
        fs::write(
            source_dir.join("SKILL.md"),
            "---\nname: pdf\ndescription: PDF documents.\n---\nbody\n",
        )
        .expect("write source SKILL.md");
        let manager = sandbox(root.path());
        let source = source_dir.to_string_lossy().into_owned();

        let first = install_in(&manager, source.clone()).expect("install");
        assert!(!first.skipped, "a fresh install copies");
        assert!(
            root.path().join(".agents/skills/pdf/SKILL.md").exists(),
            "the source directory's name is what lands on disk",
        );
        let listed = list_installed_in(&manager).expect("list");
        assert_eq!(listed.len(), 1, "a fresh install is listable: {listed:?}");
        assert_eq!(listed[0].name, "pdf");
        // `skill` reports the source *id's* slug, and a local directory has no
        // id — which is exactly why the app only ever sends the GitHub form,
        // where the slug is the id's last segment. Asserted here so the empty
        // string is a documented fact rather than a surprise.
        assert_eq!(first.skill, "", "a local directory carries no slug");

        // `add` never overwrites, so a repeat is a reported no-op, not a failure.
        let again = install_in(&manager, source).expect("install again");
        assert!(
            again.skipped,
            "an already-installed slug is skipped, not replaced",
        );
    }

    #[test]
    fn install_reports_a_source_with_no_skill_in_it() {
        let root = tempdir().expect("tempdir");
        let empty = tempdir().expect("tempdir");
        let manager = sandbox(root.path());

        assert!(install_in(&manager, empty.path().to_string_lossy().into_owned()).is_err());
    }

    #[test]
    fn link_adopts_an_agents_own_skill_into_the_canonical_dir() {
        // The behaviour the Installed page's linking is built on: an agent's
        // private skills move into the canonical dir, and its non-skill files
        // are quarantined rather than dropped.
        let root = tempdir().expect("tempdir");
        seed_agent_skill(root.path(), "cursor", "pdf");
        fs::write(root.path().join(".cursor/skills/README.md"), "notes").expect("write notes");
        let manager = sandbox(root.path());

        let linked = link_in(&manager, Some(vec!["cursor".into()]), Some(false)).expect("link");
        assert_eq!(linked.results.len(), 1);
        assert_eq!(linked.results[0].status, "linked");
        assert_eq!(linked.results[0].adopted, ["pdf"]);
        assert_eq!(linked.results[0].quarantined, ["README.md"]);

        assert!(root.path().join(".agents/skills/pdf/SKILL.md").exists());
        assert!(root
            .path()
            .join(".agents/skills/.misc/cursor/README.md")
            .exists());
    }

    #[test]
    fn unlink_breaks_the_symlink_without_moving_anything_back() {
        let root = tempdir().expect("tempdir");
        seed_agent_skill(root.path(), "cursor", "pdf");
        let manager = sandbox(root.path());
        link_in(&manager, Some(vec!["cursor".into()]), Some(false)).expect("link");

        let unlinked = link_in(&manager, Some(vec!["cursor".into()]), Some(true)).expect("unlink");
        assert_eq!(unlinked.results[0].status, "unlinked");
        assert!(
            unlinked.results[0].adopted.is_empty(),
            "unlink adopts nothing",
        );
        // Linking is one-way: the adopted copy stays in the canonical dir.
        assert!(root.path().join(".agents/skills/pdf/SKILL.md").exists());
    }

    #[test]
    fn link_status_reports_an_unlinked_agent_holding_its_own_skills() {
        // The warning state: an agent with private content is one a link would
        // change, and the UI needs to see what it holds to preview that.
        let root = tempdir().expect("tempdir");
        seed_agent_skill(root.path(), "cursor", "pdf");
        let manager = sandbox(root.path());

        let status = link_status_in(&manager).expect("status");
        let cursor = status
            .iter()
            .find(|s| s.name == "cursor")
            .expect("cursor is detected");
        assert!(!cursor.linked);
        assert!(!cursor.canonical);
        assert_eq!(cursor.internal_skills, ["pdf"]);
        assert_eq!(cursor.display, "Cursor");
    }
}

// ============================ Tauri commands ============================

/// Install one skill into the global skills directory.
///
/// `source` is one of the two forms agents-skills 0.26 accepts: a local skill
/// directory (it must directly contain a `SKILL.md` declaring a non-empty
/// `name`), or the GitHub id `owner/repo/slug` — the slug is the SKILL.md
/// frontmatter `name` slugified. The whole repository tarball is downloaded
/// from codeload.github.com and the skill is matched locally by slugified
/// name — the GitHub REST API is never called, so its anonymous
/// 60-requests-per-hour rate limit no longer applies. When no skill directory
/// matches and the repository root has a `SKILL.md`, the whole repository is
/// installed under the repository name. The app always sends the GitHub id
/// form; the store's skill slug is the id's last segment.
///
/// One source resolves to exactly one skill, so there is no per-skill outcome
/// list: a failure is this command's `Err`, and `skipped` reports the
/// no-overwrite rule (a skill of the same slug already installed, enabled or
/// parked, is left untouched).
#[tauri::command]
pub async fn install_skill(source: String) -> Result<InstallResult, String> {
    run_blocking("install", move |m| install_in(m, source)).await
}

fn install_in(manager: &Manager, source: String) -> Result<InstallResult, String> {
    let outcome = manager
        .add(&AddRequest::new(source))
        .map_err(|e| e.to_string())?;
    // `source.slug` is the id's last segment — the slug the identity
    // commands select by. (`outcome.skill.name` is the frontmatter `name`
    // as declared, which the slug may fold differently.)
    Ok(InstallResult {
        skill: outcome.source.slug,
        skipped: outcome.skipped,
    })
}

/// List installed skills in the global skills directory. Returns the same
/// camelCase shape as `list --json`: name, single-line description, enablement
/// and install time.
#[tauri::command]
pub async fn list_installed_skills() -> Result<Vec<ListedSkillDto>, String> {
    run_blocking("list", list_installed_in).await
}

fn list_installed_in(manager: &Manager) -> Result<Vec<ListedSkillDto>, String> {
    let listed = manager.list().map_err(|e| e.to_string())?;
    Ok(listed.into_iter().map(listed_skill_dto).collect())
}

/// Resolve an installed skill's on-disk directory from its name.
///
/// Every command that takes a skill name goes through here, and that is what
/// makes them safe: the name is matched against a real scan of the canonical
/// directory rather than interpolated into a path, so a name like `../..`
/// resolves to nothing and a parked (disabled) skill stays reachable.
fn resolve_skill_dir(manager: &Manager, name: &str) -> Result<PathBuf, String> {
    let listed = manager.list().map_err(|e| e.to_string())?;
    let skill = listed
        .into_iter()
        .find(|s| s.name == name)
        .ok_or_else(|| format!("skill {name} is not installed"))?;
    Ok(manager.skill_dir(&skill))
}

/// Remove the named installed skills, returning those actually gone.
#[tauri::command]
pub async fn remove_skills(skills: Option<Vec<String>>) -> Result<Vec<String>, String> {
    run_blocking("remove", move |m| remove_in(m, skills)).await
}

fn remove_in(manager: &Manager, skills: Option<Vec<String>>) -> Result<Vec<String>, String> {
    let req = SelectionRequest {
        skills: skills.unwrap_or_default(),
        all: false,
    };
    Ok(manager.remove(&req).map_err(|e| e.to_string())?.applied)
}

/// Move the named skills between the canonical dir and the parked
/// `disabled-skills` dir (`enabled` picks the direction), returning the skills
/// that moved.
#[tauri::command]
pub async fn set_skills_enabled(
    skills: Option<Vec<String>>,
    enabled: bool,
) -> Result<Vec<String>, String> {
    run_blocking(if enabled { "enable" } else { "disable" }, move |m| {
        set_enabled_in(m, skills, enabled)
    })
    .await
}

fn set_enabled_in(
    manager: &Manager,
    skills: Option<Vec<String>>,
    enabled: bool,
) -> Result<Vec<String>, String> {
    let req = SelectionRequest {
        skills: skills.unwrap_or_default(),
        all: false,
    };
    let outcome = if enabled {
        manager.enable(&req).map_err(|e| e.to_string())?
    } else {
        manager.disable(&req).map_err(|e| e.to_string())?
    };
    Ok(outcome.applied)
}

/// Link/unlink agents' skills directories to the canonical dir.
///
/// Linking is one-way since 0.15: an agent's own skills are adopted into the
/// canonical dir (name clashes keep the canonical copy), its non-skill files
/// are quarantined into `.misc/<agent>/`, and unlink only breaks the symlink —
/// nothing is moved back.
#[tauri::command]
pub async fn link_agents(
    agents: Option<Vec<String>>,
    unlink: Option<bool>,
) -> Result<LinkResult, String> {
    run_blocking("link", move |m| link_in(m, agents, unlink)).await
}

fn link_in(
    manager: &Manager,
    agents: Option<Vec<String>>,
    unlink: Option<bool>,
) -> Result<LinkResult, String> {
    let req = AgentRequest {
        agents: agents.unwrap_or_default(),
        unlink: unlink.unwrap_or(false),
    };
    let outcome = manager.agent(&req).map_err(|e| e.to_string())?;
    Ok(LinkResult {
        results: outcome.results.into_iter().map(agent_link_result).collect(),
    })
}

/// Report per-agent link status (linked / canonical / not linked), including
/// each unlinked agent's private content — what a link would adopt and what it
/// would quarantine.
#[tauri::command]
pub async fn link_status() -> Result<Vec<AgentStatusDto>, String> {
    run_blocking("link status", link_status_in).await
}

fn link_status_in(manager: &Manager) -> Result<Vec<AgentStatusDto>, String> {
    Ok(manager
        .agent_status()
        .into_iter()
        .map(|s| AgentStatusDto {
            name: s.name,
            display: s.display,
            linked: s.linked,
            canonical: s.canonical,
            internal_skills: s.internal_skills,
            internal_others: s.internal_others,
        })
        .collect())
}

/// Read the raw `SKILL.md` of a locally installed skill (enabled or disabled).
///
/// Powers the detail view for skills without a registry source. The name is
/// resolved through the same `list` the UI shows — so no path traversal is
/// possible and skills parked by disable stay readable.
#[tauri::command]
pub async fn read_skill_md(name: String) -> Result<SkillMdDto, String> {
    run_blocking("read skill md", move |m| read_skill_md_in(m, &name)).await
}

fn read_skill_md_in(manager: &Manager, name: &str) -> Result<SkillMdDto, String> {
    read_skill_md_file(&resolve_skill_dir(manager, name)?)
}

/// Overwrite an installed skill's `SKILL.md` with `content` (frontmatter
/// included — the editor edits the raw file).
///
/// The name is resolved through the same `list` `read_skill_md` uses, so no
/// path is ever interpolated from the frontend and disabled (parked) skills
/// stay writable. The write is atomic — see `write_skill_md_file`.
#[tauri::command]
pub async fn write_skill_md(name: String, content: String) -> Result<(), String> {
    run_blocking("write skill md", move |m| {
        write_skill_md_in(m, &name, &content)
    })
    .await
}

fn write_skill_md_in(manager: &Manager, name: &str, content: &str) -> Result<(), String> {
    write_skill_md_file(&resolve_skill_dir(manager, name)?, content)
}

/// Open an installed skill's directory in the system file manager.
///
/// The name is resolved through the same `list` the read/write commands use,
/// so no path is ever interpolated from the frontend and disabled (parked)
/// skills stay reachable. The opening itself happens here on the Rust side
/// through the opener plugin, so the webview never gains a general "open any
/// path" permission.
#[tauri::command]
pub async fn open_skill_dir(name: String) -> Result<(), String> {
    run_blocking("open skill dir", move |m| {
        // Only the resolution is testable; the open itself is the OS. Keeping
        // the two apart is what lets `resolve_skill_dir` be exercised at all.
        let dir = resolve_skill_dir(m, &name)?;
        tauri_plugin_opener::open_path(&dir, None::<&str>)
            .map_err(|e| format!("open {}: {e}", dir.display()))
    })
    .await
}

/// Stat-only change-detection identity of an installed skill's directory (see
/// `dir_fingerprint.rs`): the guard the provenance ledger checks before reusing
/// a cached ranking. Stat only — no file bytes are read.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FingerprintDto {
    pub mtime_ms: f64,
    pub size: u64,
}

/// Stat-only fingerprint of an installed skill's directory — no file bytes are
/// read, so the ledger can revalidate a cached candidate list cheaply.
///
/// `None` when the name is not installed. The name resolves through `list`,
/// so no path is ever interpolated.
#[tauri::command]
pub async fn skill_fingerprint(name: String) -> Result<Option<FingerprintDto>, String> {
    run_blocking("skill fingerprint", move |m| fingerprint_in(m, &name)).await
}

fn fingerprint_in(manager: &Manager, name: &str) -> Result<Option<FingerprintDto>, String> {
    let listed = manager.list().map_err(|e| e.to_string())?;
    match listed.into_iter().find(|s| s.name == name) {
        None => Ok(None),
        Some(skill) => {
            let fp = dir_fingerprint::fingerprint_skill_dir(&manager.skill_dir(&skill))?;
            Ok(Some(FingerprintDto {
                mtime_ms: fp.mtime_ms,
                size: fp.size,
            }))
        }
    }
}
