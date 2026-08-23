//! Skills install / agent management, backed by the `agents-skills` library.
//!
//! Exposes the library's [`Manager`] facade as async Tauri commands. All blocking
//! work (git clone, install, link, ...) is offloaded to the blocking thread pool.

use serde::Serialize;

use agents_skills::{
    AddRequest, LinkOutcome, LinkRequest, ListRequest, Manager, RemoveRequest, Scope,
    UpdateRequest,
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
pub struct AgentLinkResultDto {
    pub agent: String,
    pub display: String,
    pub status: String,
    pub moved: Vec<String>,
    pub skipped: Vec<String>,
    pub skills: Vec<String>,
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
pub struct AgentStatusDto {
    pub name: String,
    pub display: String,
    pub linked: bool,
    pub canonical: bool,
}

// ============================ Conversion helpers ============================

fn link_outcome_fields(
    outcome: LinkOutcome,
) -> (String, Vec<String>, Vec<String>, Vec<String>, Option<String>) {
    match outcome {
        LinkOutcome::Linked => ("linked".into(), vec![], vec![], vec![], None),
        LinkOutcome::AlreadyLinked => ("alreadyLinked".into(), vec![], vec![], vec![], None),
        LinkOutcome::Migrated { moved, skipped } => {
            ("migrated".into(), moved, skipped, vec![], None)
        }
        LinkOutcome::Refused { skills, reason } => {
            ("refused".into(), vec![], vec![], skills, Some(reason))
        }
        LinkOutcome::Skipped => ("skipped".into(), vec![], vec![], vec![], None),
        LinkOutcome::Failed { error } => ("failed".into(), vec![], vec![], vec![], Some(error)),
        LinkOutcome::Unlinked => ("unlinked".into(), vec![], vec![], vec![], None),
        LinkOutcome::NotLinked => ("notLinked".into(), vec![], vec![], vec![], None),
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
    full_depth: Option<bool>,
    cwd: Option<String>,
) -> Result<InstallResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let req = AddRequest {
            source,
            global: global.unwrap_or(false),
            skills: skills.unwrap_or_default(),
            list_only: list_only.unwrap_or(false),
            full_depth: full_depth.unwrap_or(false),
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
/// user-level install). Returns the same camelCase shape as `list --json`.
#[tauri::command]
pub async fn list_installed_skills(
    global: Option<bool>,
    agents: Option<Vec<String>>,
    cwd: Option<String>,
) -> Result<Vec<agents_skills::ListedSkill>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        let req = ListRequest {
            global: global.unwrap_or(false),
            agents: agents.unwrap_or_default(),
        };
        manager.list(&req).map_err(|e| e.to_string())
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

/// Link/unlink agents' skills directories to the canonical dir.
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
        let req = LinkRequest {
            agents: agents.unwrap_or_default(),
            global: global.unwrap_or(false),
            unlink: unlink.unwrap_or(false),
            migrate: migrate.unwrap_or(false),
        };
        let outcome = manager.link(&req).map_err(|e| e.to_string())?;
        Ok(LinkResult {
            global: outcome.global,
            results: outcome
                .results
                .into_iter()
                .map(|r| {
                    let (status, moved, skipped, skills, message) =
                        link_outcome_fields(r.outcome);
                    AgentLinkResultDto {
                        agent: r.agent,
                        display: r.display,
                        status,
                        moved,
                        skipped,
                        skills,
                        message,
                    }
                })
                .collect(),
        })
    })
    .await
    .map_err(|e| format!("link task failed: {e}"))?
}

/// Report per-agent link status (linked / canonical / not linked).
#[tauri::command]
pub async fn link_status(
    global: Option<bool>,
    cwd: Option<String>,
) -> Result<Vec<AgentStatusDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let manager = manager(cwd.as_deref());
        Ok(manager
            .link_status(global.unwrap_or(false))
            .into_iter()
            .map(|s| AgentStatusDto {
                name: s.name,
                display: s.display,
                linked: s.linked,
                canonical: s.canonical,
            })
            .collect())
    })
    .await
    .map_err(|e| format!("link status task failed: {e}"))?
}
