//! Skills install / agent management, backed by the `agents-skills` library.
//!
//! Exposes the library's [`Manager`] facade as async Tauri commands. All blocking
//! work (git clone, install, link, ...) is offloaded to the blocking thread pool.

use serde::Serialize;

use agents_skills::{
    AddRequest, AgentRequest, DisableRequest, EnableRequest, LinkOutcome, ListRequest, Manager,
    RemoveRequest, Scope, UpdateRequest,
};

/// Build a `Manager` targeting `cwd` (empty/`None` = the process's own cwd).
///
/// `cwd` selects the project scope root: skills install into `.agents/skills`
/// under that directory, and its lockfile is used.
fn manager(cwd: Option<&str>) -> Manager {
    match cwd.filter(|s| !s.trim().is_empty()) {
        Some(p) => Manager::builder().cwd(p).build(),
        None => Manager::new(),
    }
}

// ============================ DTOs (serialized to the frontend) ============================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillDto {
    pub name: String,
    pub canonical_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallFailureDto {
    pub skill: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub list_only: bool,
    pub installed: Vec<InstalledSkillDto>,
    pub failed: Vec<InstallFailureDto>,
    pub discovered: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveResult {
    pub installed: Vec<String>,
    pub requested: Vec<String>,
    pub removed: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResult {
    pub global: bool,
    pub updated: usize,
    pub failed: usize,
    pub updated_names: Vec<String>,
    pub failures: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DisableResult {
    pub installed: Vec<String>,
    pub requested: Vec<String>,
    pub disabled: Vec<String>,
    pub already: Vec<String>,
    pub missing: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnableResult {
    pub disabled: Vec<String>,
    pub requested: Vec<String>,
    pub enabled: Vec<String>,
    pub already: Vec<String>,
    pub missing: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLinkResultDto {
    pub agent: String,
    pub display: String,
    pub status: String,
    /// Skills moved into the canonical dir (`migrated`).
    pub moved: Vec<String>,
    /// Skills left parked because the canonical dir already has them — the
    /// canonical copy wins (`migrated`); the agent-side copy stays in backup.
    pub skipped: Vec<String>,
    /// Skills parked in the backup slot (`linked`/`migrated`); a later migrate
    /// adopts them into the canonical dir, unlink restores them.
    pub parked_skills: Vec<String>,
    /// Non-skill entries parked in the backup slot (`linked`/`migrated`); a
    /// migrate never adopts these.
    pub parked_others: Vec<String>,
    /// Backup slot dir holding the parked content (`linked`/`migrated`), if any.
    pub backup_dir: Option<String>,
    /// Entries restored from the backup slot (`unlinked`).
    pub restored: Vec<String>,
    /// The backup slot dir the restored content came from (`unlinked`).
    pub restored_from: Option<String>,
    /// Refusal reason or error message (`refused`/`failed`).
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkResult {
    pub global: bool,
    pub results: Vec<AgentLinkResultDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingBackupDto {
    /// The backup slot dir (`.agents/backup-skills/<agent>`).
    pub path: String,
    /// Names of the entries parked in the slot.
    pub items: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusDto {
    pub name: String,
    pub display: String,
    pub linked: bool,
    pub canonical: bool,
    /// Skills inside the agent's own skills dir. Only populated for unlinked,
    /// non-canonical agents: it surfaces what a migrate would move into the
    /// canonical dir. Empty for linked/canonical agents (they share the
    /// canonical dir, shown by `list`).
    pub internal_skills: Vec<String>,
    /// Non-skill entries (files, symlinks to non-directories) inside the
    /// agent's own skills dir. Same population rules as `internal_skills`; a
    /// link parks them into the backup slot, a migrate never adopts them.
    pub internal_others: Vec<String>,
    /// Backup slot with content parked by a previous link, waiting to be
    /// restored by unlink (or adopted by a later migrate). `None` when no
    /// backup is pending.
    pub pending_backup: Option<PendingBackupDto>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedSkillDto {
    pub name: String,
    pub path: String,
    pub scope: String,
    pub agents: Vec<String>,
    pub source: Option<String>,
    pub source_url: Option<String>,
    pub source_type: Option<String>,
    /// Short human-readable description extracted from the on-disk SKILL.md
    /// frontmatter; `None` when the file is missing or has no description.
    pub description: Option<String>,
    pub enabled: bool,
}

// ============================ Conversion helpers ============================

#[derive(serde::Deserialize)]
struct Frontmatter {
    name: Option<String>,
    description: Option<String>,
}

/// Read a SKILL.md frontmatter and return its `name` and `description`.
///
/// `agents-skills` 0.8 made its frontmatter parser private, so the same shape
/// is parsed here: a `---`-fenced YAML block, with both `name` and
/// `description` mandatory in the skill format. Returns `None` on any
/// deviation — unreadable file, missing fence, invalid YAML, missing fields,
/// or a UTF-8 BOM before the fence (the YAML parser rejects one).
fn parse_skill_md(skill_md: &std::path::Path) -> Option<(String, String)> {
    let content = std::fs::read_to_string(skill_md).ok()?;
    let rest = content
        .strip_prefix("---\r\n")
        .or_else(|| content.strip_prefix("---\n"))?;
    let end = rest.find("\n---")?;
    let fm: Frontmatter = serde_yaml::from_str(&rest[..end]).ok()?;
    Some((fm.name?, fm.description?))
}

/// Extract a skill's `description` for the UI (the backend's `list` does not
/// expose one). Block scalars are folded to a single line (the UI contract),
/// and the result is `None` when the folded text is empty.
fn extract_description(skill_dir: &std::path::Path) -> Option<String> {
    let (_, description) = parse_skill_md(&skill_dir.join("SKILL.md"))?;
    let folded = description.split_whitespace().collect::<Vec<_>>().join(" ");
    (!folded.is_empty()).then_some(folded)
}

/// Map a library link outcome to the flat DTO the frontend consumes.
fn agent_link_result(result: agents_skills::AgentLinkResult) -> AgentLinkResultDto {
    let (status, moved, skipped, parked_skills, parked_others, backup_dir, restored, restored_from, message) =
        match result.outcome {
            LinkOutcome::Linked {
                parked_skills,
                parked_others,
                backup_dir,
            } => (
                "linked",
                vec![],
                vec![],
                parked_skills,
                parked_others,
                backup_dir,
                vec![],
                None,
                None,
            ),
            LinkOutcome::AlreadyLinked => (
                "alreadyLinked",
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                vec![],
                None,
                None,
            ),
            LinkOutcome::Migrated {
                moved,
                skipped,
                parked_others,
                backup_dir,
            } => (
                "migrated",
                moved,
                skipped,
                vec![],
                parked_others,
                backup_dir,
                vec![],
                None,
                None,
            ),
            LinkOutcome::Refused { reason } => (
                "refused",
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                vec![],
                None,
                Some(reason),
            ),
            LinkOutcome::Skipped => (
                "skipped",
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                vec![],
                None,
                None,
            ),
            LinkOutcome::Failed { error } => (
                "failed",
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                vec![],
                None,
                Some(error),
            ),
            LinkOutcome::Unlinked {
                restored,
                restored_from,
            } => (
                "unlinked",
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                restored,
                restored_from,
                None,
            ),
            LinkOutcome::NotLinked => (
                "notLinked",
                vec![],
                vec![],
                vec![],
                vec![],
                None,
                vec![],
                None,
                None,
            ),
        };
    AgentLinkResultDto {
        agent: result.agent,
        display: result.display,
        status: status.to_string(),
        moved,
        skipped,
        parked_skills,
        parked_others,
        backup_dir: backup_dir.map(|p| p.display().to_string()),
        restored,
        restored_from: restored_from.map(|p| p.display().to_string()),
        message,
    }
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
    fn extracts_single_line_description() {
        let dir = skill_dir_with("---\nname: pdf\ndescription: 读取 PDF 文件。\n---\n正文");
        assert_eq!(extract_description(dir.path()).as_deref(), Some("读取 PDF 文件。"));
    }

    #[test]
    fn extracts_quoted_description() {
        let dir = skill_dir_with("---\nname: pdf\ndescription: \"a quoted description\"\n---\n");
        assert_eq!(extract_description(dir.path()).as_deref(), Some("a quoted description"));
    }

    #[test]
    fn folds_block_scalar_description() {
        let dir = skill_dir_with(
            "---\nname: pdf\ndescription: |\n  第一行描述\n  第二行描述\n---\n",
        );
        assert_eq!(
            extract_description(dir.path()).as_deref(),
            Some("第一行描述 第二行描述")
        );
    }

    #[test]
    fn missing_name_field_yields_none() {
        // Both `name` and `description` are mandatory in the agents skill
        // format, so a frontmatter with only a description shows no
        // description in the UI.
        let dir = skill_dir_with("---\ndescription: \"no name here\"\n---\n");
        assert_eq!(extract_description(dir.path()), None);
    }

    #[test]
    fn tolerates_bom_and_missing_description() {
        let dir = skill_dir_with("\u{feff}---\nname: x\n---\n正文");
        assert_eq!(extract_description(dir.path()), None);
    }

    #[test]
    fn link_outcome_parked_content_maps_to_flat_fields() {
        let dto = agent_link_result(agents_skills::AgentLinkResult {
            agent: "cursor".into(),
            display: "Cursor".into(),
            outcome: LinkOutcome::Linked {
                parked_skills: vec!["pdf".into()],
                parked_others: vec!["README.md".into()],
                backup_dir: Some(std::path::PathBuf::from("/backup/cursor")),
            },
        });
        assert_eq!(dto.status, "linked");
        assert_eq!(dto.parked_skills, vec!["pdf"]);
        assert_eq!(dto.parked_others, vec!["README.md"]);
        assert_eq!(dto.backup_dir.as_deref(), Some("/backup/cursor"));
        assert!(dto.restored.is_empty());
        assert!(dto.message.is_none());
    }

    #[test]
    fn link_outcome_refused_carries_only_the_reason() {
        let dto = agent_link_result(agents_skills::AgentLinkResult {
            agent: "cursor".into(),
            display: "Cursor".into(),
            outcome: LinkOutcome::Refused {
                reason: "a previous backup is still parked".into(),
            },
        });
        assert_eq!(dto.status, "refused");
        assert_eq!(dto.message.as_deref(), Some("a previous backup is still parked"));
        assert!(dto.parked_skills.is_empty());
        assert!(dto.backup_dir.is_none());
    }

    #[test]
    fn link_outcome_unlinked_reports_the_restored_content() {
        let dto = agent_link_result(agents_skills::AgentLinkResult {
            agent: "cursor".into(),
            display: "Cursor".into(),
            outcome: LinkOutcome::Unlinked {
                restored: vec!["pdf".into()],
                restored_from: Some(std::path::PathBuf::from("/backup/cursor/skills")),
            },
        });
        assert_eq!(dto.status, "unlinked");
        assert_eq!(dto.restored, vec!["pdf"]);
        assert_eq!(dto.restored_from.as_deref(), Some("/backup/cursor/skills"));
    }
}

// ============================ Tauri commands ============================

/// Install skills from a source (git repo, GitHub `owner/repo`, local path or
/// download URL). Set `list_only` to preview what would be installed.
#[tauri::command]
pub async fn install_skill(
    source: String,
    global: Option<bool>,
    skills: Option<Vec<String>>,
    list_only: Option<bool>,
    cwd: Option<String>,
) -> Result<InstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let req = AddRequest {
            source,
            global: global.unwrap_or(false),
            skills: skills.unwrap_or_default(),
            list_only: list_only.unwrap_or(false),
        };
        let outcome = manager.add(&req).map_err(|e| e.to_string())?;
        Ok(InstallResult {
            list_only: outcome.list_only,
            installed: outcome
                .installed
                .into_iter()
                .map(|s| InstalledSkillDto {
                    name: s.name,
                    canonical_path: s.canonical_path.display().to_string(),
                })
                .collect(),
            failed: outcome
                .failed
                .into_iter()
                .map(|f| InstallFailureDto {
                    skill: f.skill,
                    error: f.error,
                })
                .collect(),
            discovered: outcome.skills.into_iter().map(|s| s.name).collect(),
        })
    })
    .await
    .map_err(|e| format!("install task failed: {e}"))?
}

/// List installed skills (project scope by default, pass `global` for the
/// user-level install). Returns the same camelCase shape as `list --json`,
/// plus a `description` extracted from each skill's on-disk SKILL.md.
#[tauri::command]
pub async fn list_installed_skills(
    global: Option<bool>,
    agents: Option<Vec<String>>,
    cwd: Option<String>,
) -> Result<Vec<ListedSkillDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let req = ListRequest {
            global: global.unwrap_or(false),
            agents: agents.unwrap_or_default(),
        };
        let listed = manager.list(&req).map_err(|e| e.to_string())?;
        Ok(listed
            .into_iter()
            .map(|s| ListedSkillDto {
                name: s.name,
                path: s.path.display().to_string(),
                scope: s.scope,
                agents: s.agents,
                source: s.source,
                source_url: s.source_url,
                source_type: s.source_type,
                description: extract_description(&s.path),
                enabled: s.enabled,
            })
            .collect())
    })
    .await
    .map_err(|e| format!("list task failed: {e}"))?
}

/// Remove installed skills. With no `skills` and no `all`, only reports what is
/// currently installed.
#[tauri::command]
pub async fn remove_skills(
    skills: Option<Vec<String>>,
    global: Option<bool>,
    all: Option<bool>,
    cwd: Option<String>,
) -> Result<RemoveResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let req = RemoveRequest {
            skills: skills.unwrap_or_default(),
            global: global.unwrap_or(false),
            all: all.unwrap_or(false),
        };
        let outcome = manager.remove(&req).map_err(|e| e.to_string())?;
        Ok(RemoveResult {
            installed: outcome.installed,
            requested: outcome.requested,
            removed: outcome.removed,
        })
    })
    .await
    .map_err(|e| format!("remove task failed: {e}"))?
}

/// Update installed skills from their recorded sources. `scope` is one of
/// `"auto" | "global" | "project"`.
#[tauri::command]
pub async fn update_skills(
    skills: Option<Vec<String>>,
    scope: Option<String>,
    cwd: Option<String>,
) -> Result<UpdateResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let scope = match scope.as_deref() {
            Some("global") => Scope::Global,
            Some("project") => Scope::Project,
            _ => Scope::Auto,
        };
        let req = UpdateRequest {
            skills: skills.unwrap_or_default(),
            scope,
        };
        let outcome = manager.update(&req).map_err(|e| e.to_string())?;
        Ok(UpdateResult {
            global: outcome.global,
            updated: outcome.updated,
            failed: outcome.failed,
            updated_names: outcome.updated_names,
            failures: outcome.failures,
        })
    })
    .await
    .map_err(|e| format!("update task failed: {e}"))?
}

/// Disable installed skills (moves them out of the canonical dir). With no
/// `skills` and no `all`, only reports what is currently enabled.
#[tauri::command]
pub async fn disable_skills(
    skills: Option<Vec<String>>,
    global: Option<bool>,
    all: Option<bool>,
    cwd: Option<String>,
) -> Result<DisableResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let req = DisableRequest {
            skills: skills.unwrap_or_default(),
            global: global.unwrap_or(false),
            all: all.unwrap_or(false),
        };
        let outcome = manager.disable(&req).map_err(|e| e.to_string())?;
        Ok(DisableResult {
            installed: outcome.installed,
            requested: outcome.requested,
            disabled: outcome.disabled,
            already: outcome.already,
            missing: outcome.missing,
        })
    })
    .await
    .map_err(|e| format!("disable task failed: {e}"))?
}

/// Enable disabled skills (moves them back into the canonical dir). With no
/// `skills` and no `all`, only reports what is currently disabled.
#[tauri::command]
pub async fn enable_skills(
    skills: Option<Vec<String>>,
    global: Option<bool>,
    all: Option<bool>,
    cwd: Option<String>,
) -> Result<EnableResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let req = EnableRequest {
            skills: skills.unwrap_or_default(),
            global: global.unwrap_or(false),
            all: all.unwrap_or(false),
        };
        let outcome = manager.enable(&req).map_err(|e| e.to_string())?;
        Ok(EnableResult {
            disabled: outcome.disabled,
            requested: outcome.requested,
            enabled: outcome.enabled,
            already: outcome.already,
            missing: outcome.missing,
        })
    })
    .await
    .map_err(|e| format!("enable task failed: {e}"))?
}

/// Link/unlink agents' skills directories to the canonical dir. With `migrate`,
/// skills already inside the agent's dir (or parked in its backup slot) move
/// into the canonical dir; everything else is parked and restorable by unlink.
#[tauri::command]
pub async fn link_agents(
    agents: Option<Vec<String>>,
    global: Option<bool>,
    unlink: Option<bool>,
    migrate: Option<bool>,
    cwd: Option<String>,
) -> Result<LinkResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let req = AgentRequest {
            agents: agents.unwrap_or_default(),
            global: global.unwrap_or(false),
            unlink: unlink.unwrap_or(false),
            migrate: migrate.unwrap_or(false),
        };
        let outcome = manager.agent(&req).map_err(|e| e.to_string())?;
        Ok(LinkResult {
            global: outcome.global,
            results: outcome.results.into_iter().map(agent_link_result).collect(),
        })
    })
    .await
    .map_err(|e| format!("link task failed: {e}"))?
}

/// Report per-agent link status (linked / canonical / not linked), including
/// each unlinked agent's private content and any backup waiting to be restored.
#[tauri::command]
pub async fn link_status(
    global: Option<bool>,
    cwd: Option<String>,
) -> Result<Vec<AgentStatusDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let global = global.unwrap_or(false);
        Ok(manager
            .agent_status(global)
            .into_iter()
            .map(|s| AgentStatusDto {
                name: s.name,
                display: s.display,
                linked: s.linked,
                canonical: s.canonical,
                internal_skills: s.internal_skills,
                internal_others: s.internal_others,
                pending_backup: s.pending_backup.map(|b| PendingBackupDto {
                    path: b.path.display().to_string(),
                    items: b.items,
                }),
            })
            .collect())
    })
    .await
    .map_err(|e| format!("link status task failed: {e}"))?
}
