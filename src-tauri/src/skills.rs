//! Skills install / agent management, backed by the `agents-skills` library.
//!
//! Exposes the library's [`Manager`] facade as async Tauri commands. All blocking
//! work (GitHub downloads, install, link, hashing, ...) is offloaded to the
//! blocking thread pool.

use serde::Serialize;

use crate::skill_hash;
use agents_skills::{
    AddRequest, AgentRequest, DisableRequest, EnableRequest, LinkOutcome, Manager, RemoveRequest,
};

/// The skills directory is the user-level **global** one (`~/.agents/skills`).
///
/// Since agents-skills 0.17 project-level scope is gone entirely: the library
/// no longer takes a `global` flag (every operation targets the canonical dir),
/// so neither does this app.
fn manager() -> Manager {
    Manager::new()
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
    tauri::async_runtime::spawn_blocking(move || f(&manager()))
        .await
        .map_err(|e| format!("{task} task failed: {e}"))?
}

// ============================ DTOs (serialized to the frontend) ============================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    /// The installed skill's on-disk directory name — the identity
    /// `remove`/`disable`/`enable` use. Since 0.22 the `SKILL.md` frontmatter
    /// `name` is never read, so this is always the directory basename.
    pub skill: String,
    /// `true` when nothing was copied because a skill of the same name is
    /// already installed (enabled or disabled): since 0.17 `add` never
    /// overwrites, so a repeat install is a no-op reported here, never a
    /// failure.
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
/// library's `ListedSkill` carries no `path` either (the name *is* the on-disk
/// directory name; resolve a directory with `Manager::skill_dir` when one is
/// needed), and neither does this DTO.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedSkillDto {
    pub name: String,
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
            description: "读取 PDF 文件。".into(),
            enabled: true,
            installed_at: Some(1_760_000_000),
        });
        assert_eq!(dto.name, "pdf");
        assert_eq!(dto.description, "读取 PDF 文件。");
        assert!(dto.enabled);
        assert_eq!(dto.installed_at, Some(1_760_000_000));
    }

    #[test]
    fn listed_skill_dto_keeps_a_missing_install_time() {
        // Some Linux filesystems record no directory creation time.
        let dto = listed_skill_dto(agents_skills::ListedSkill {
            name: "pdf".into(),
            description: "d".into(),
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
}

// ============================ Tauri commands ============================

/// Install one skill into the global skills directory.
///
/// `source` is one of the two forms agents-skills 0.21 accepts: a local skill
/// directory (it must directly contain a `SKILL.md`), or `owner/repo@<skill>`
/// for one skill on GitHub — resolved through the GitHub API, which downloads
/// only the matched skill directory (the git clone / archive paths are gone).
/// The app always sends the GitHub form; the store's skill name is the
/// directory name the source matches on.
///
/// One source resolves to exactly one skill, so there is no per-skill outcome
/// list: a failure is this command's `Err`, and `skipped` reports the 0.17
/// no-overwrite rule (a skill of the same name already installed, enabled or
/// parked, is left untouched).
#[tauri::command]
pub async fn install_skill(source: String) -> Result<InstallResult, String> {
    run_blocking("install", move |manager| {
        let outcome = manager
            .add(&AddRequest::new(source))
            .map_err(|e| e.to_string())?;
        Ok(InstallResult {
            skill: outcome.skill.name,
            skipped: outcome.skipped,
        })
    })
    .await
}

/// List installed skills in the global skills directory. Returns the same
/// camelCase shape as `list --json`: name, single-line description, enablement
/// and install time.
#[tauri::command]
pub async fn list_installed_skills() -> Result<Vec<ListedSkillDto>, String> {
    run_blocking("list", move |manager| {
        let listed = manager.list().map_err(|e| e.to_string())?;
        Ok(listed.into_iter().map(listed_skill_dto).collect())
    })
    .await
}

/// Remove the named installed skills, returning those actually gone.
#[tauri::command]
pub async fn remove_skills(skills: Option<Vec<String>>) -> Result<Vec<String>, String> {
    run_blocking("remove", move |manager| {
        let req = RemoveRequest {
            skills: skills.unwrap_or_default(),
            all: false,
        };
        Ok(manager.remove(&req).map_err(|e| e.to_string())?.removed)
    })
    .await
}

/// Move the named skills between the canonical dir and the parked
/// `disabled-skills` dir (`enabled` picks the direction), returning the skills
/// that moved.
#[tauri::command]
pub async fn set_skills_enabled(
    skills: Option<Vec<String>>,
    enabled: bool,
) -> Result<Vec<String>, String> {
    run_blocking(if enabled { "enable" } else { "disable" }, move |manager| {
        let names = skills.unwrap_or_default();
        let outcome = if enabled {
            manager
                .enable(&EnableRequest {
                    skills: names,
                    all: false,
                })
                .map_err(|e| e.to_string())?
                .enabled
        } else {
            manager
                .disable(&DisableRequest {
                    skills: names,
                    all: false,
                })
                .map_err(|e| e.to_string())?
                .disabled
        };
        Ok(outcome)
    })
    .await
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
    run_blocking("link", move |manager| {
        let req = AgentRequest {
            agents: agents.unwrap_or_default(),
            unlink: unlink.unwrap_or(false),
        };
        let outcome = manager.agent(&req).map_err(|e| e.to_string())?;
        Ok(LinkResult {
            results: outcome.results.into_iter().map(agent_link_result).collect(),
        })
    })
    .await
}

/// Report per-agent link status (linked / canonical / not linked), including
/// each unlinked agent's private content — what a link would adopt and what it
/// would quarantine.
#[tauri::command]
pub async fn link_status() -> Result<Vec<AgentStatusDto>, String> {
    run_blocking("link status", move |manager| {
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
    })
    .await
}

/// Read the raw `SKILL.md` of a locally installed skill (enabled or disabled).
///
/// Powers the detail view for skills without a registry source. The name is
/// resolved through the same `list` the UI shows — so no path traversal is
/// possible and skills parked by disable stay readable.
#[tauri::command]
pub async fn read_skill_md(name: String) -> Result<SkillMdDto, String> {
    run_blocking("read skill md", move |manager| {
        let listed = manager.list().map_err(|e| e.to_string())?;
        let skill = listed
            .into_iter()
            .find(|s| s.name == name)
            .ok_or_else(|| format!("skill {name} is not installed"))?;
        read_skill_md_file(&manager.skill_dir(&skill))
    })
    .await
}

/// Compute the skills.sh upstream content hash of a locally installed skill
/// (see `skill_hash.rs` for the algorithm).
///
/// `None` when the name is not installed; a hash error (unreadable files)
/// surfaces as the command error — the frontend treats both as "no match".
/// The name resolves through `list`, so no path is ever interpolated.
#[tauri::command]
pub async fn compute_skill_hash(name: String) -> Result<Option<String>, String> {
    run_blocking("compute skill hash", move |manager| {
        let listed = manager.list().map_err(|e| e.to_string())?;
        match listed.into_iter().find(|s| s.name == name) {
            None => Ok(None),
            Some(skill) => skill_hash::hash_skill_dir(&manager.skill_dir(&skill)).map(Some),
        }
    })
    .await
}
