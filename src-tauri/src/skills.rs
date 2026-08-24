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

/// Read a skill's SKILL.md on disk and return its frontmatter `description`.
/// The backend's `list` does not expose descriptions, so they are extracted
/// here for the UI. Handles single-line values, quoted values, and YAML block
/// scalars (`description: |` / `description: >`). `None` when the file is
/// unreadable or the frontmatter has no description.
fn extract_description(skill_dir: &std::path::Path) -> Option<String> {
    let raw = std::fs::read_to_string(skill_dir.join("SKILL.md")).ok()?;
    let content = raw.strip_prefix('\u{feff}').unwrap_or(&raw);
    let frontmatter = content.strip_prefix("---")?.split_once("\n---")?.0;
    let mut lines = frontmatter.lines();
    while let Some(line) = lines.next() {
        let Some(rest) = line.trim_start().strip_prefix("description:") else {
            continue;
        };
        let value = rest.trim().trim_matches(['"', '\'']).trim();
        // Block scalars (`|` / `>`) are markers, not the description itself.
        if !value.is_empty() && value != "|" && value != ">" {
            return Some(value.to_string());
        }
        // Empty value or a block scalar (`|` / `>`): fold the following
        // indented lines into a single line.
        let mut block: Vec<&str> = Vec::new();
        for next in lines.by_ref() {
            if next.trim().is_empty() {
                continue;
            }
            if !next.starts_with(' ') && !next.starts_with('\t') {
                break;
            }
            block.push(next.trim().trim_matches(['"', '\'']).trim());
        }
        let folded = block.join(" ");
        if !folded.is_empty() {
            return Some(folded);
        }
    }
    None
}

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
        let dir = skill_dir_with("---\ndescription: \"a quoted description\"\n---\n");
        assert_eq!(extract_description(dir.path()).as_deref(), Some("a quoted description"));
    }

    #[test]
    fn folds_block_scalar_description() {
        let dir = skill_dir_with("---\ndescription: |\n  第一行描述\n  第二行描述\n---\n");
        assert_eq!(
            extract_description(dir.path()).as_deref(),
            Some("第一行描述 第二行描述")
        );
    }

    #[test]
    fn tolerates_bom_and_missing_description() {
        let dir = skill_dir_with("\u{feff}---\nname: x\n---\n正文");
        assert_eq!(extract_description(dir.path()), None);
    }
}

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
        let req = AgentRequest {
            agents: agents.unwrap_or_default(),
            global: global.unwrap_or(false),
            unlink: unlink.unwrap_or(false),
            migrate: migrate.unwrap_or(false),
        };
        let outcome = manager.agent(&req).map_err(|e| e.to_string())?;
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
            .agent_status(global.unwrap_or(false))
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
