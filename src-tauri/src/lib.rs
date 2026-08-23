// Skillone — minimal Tauri entry. Downloads the full skills index (a JSONL
// file published as a GitHub release asset), caches it in memory and serves
// it to the frontend page by page.

use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};

mod skills;

/// JSONL index released by the skills-index repo: one JSON object per line.
/// Unlike the skills.sh API these entries carry a `description` (and `path`),
/// and the skill name lives in `skillId` — there is no separate `name` field.
const INDEX_URL: &str =
    "https://github.com/luckie2076/skills-index/releases/latest/download/index.jsonl";

/// Number of skills returned per page. Matches the old skills.sh page size so
/// the frontend pagination flow is unchanged.
const PAGE_SIZE: usize = 200;

/// One line of the JSONL index. Unknown/missing fields are ignored; optional
/// ones fall back to defaults so a single malformed line never breaks the
/// whole index.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawEntry {
    skill_id: String,
    source: String,
    installs: u64,
    #[serde(default)]
    weekly_installs: Vec<u64>,
    #[serde(default)]
    description: Option<String>,
}

/// A skill as handed to the frontend (field names match the old skills.sh
/// page shape, plus the description the new index provides).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Skill {
    source: String,
    skill_id: String,
    name: String,
    installs: u64,
    weekly_installs: Vec<u64>,
    description: String,
}

/// One page of skills, serialized as `{ skills, hasMore, total }` so the
/// frontend can append pages and stop when `hasMore` is false.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Page {
    skills: Vec<Skill>,
    has_more: bool,
    total: usize,
}

/// Process-wide cache of the parsed index; the JSONL file is downloaded once
/// and reused across pagination requests.
static INDEX_CACHE: OnceLock<Mutex<Option<Vec<Skill>>>> = OnceLock::new();

fn index_cache() -> &'static Mutex<Option<Vec<Skill>>> {
    INDEX_CACHE.get_or_init(|| Mutex::new(None))
}

/// Whether a source is a GitHub repo in "owner/repo" form.
///
/// The index also lists non-GitHub sources (e.g. "open.feishu.cn") which are
/// not addressable repos, so they are filtered out (mirrors the frontend).
fn is_github_repo(source: &str) -> bool {
    let parts: Vec<&str> = source.split('/').collect();
    parts.len() == 2
        && !parts[0].is_empty()
        && !parts[1].is_empty()
        // GitHub usernames never contain a dot; a dot means a domain (e.g.
        // "open.feishu.cn") rather than an owner.
        && !parts[0].contains('.')
}

/// Parse the JSONL index into a list of GitHub skills, skipping blank lines
/// and entries that are malformed or not GitHub repos.
fn parse_index(text: &str) -> Vec<Skill> {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter_map(|line| serde_json::from_str::<RawEntry>(line).ok())
        .filter(|e| is_github_repo(&e.source))
        .map(|e| Skill {
            skill_id: e.skill_id.clone(),
            name: e.skill_id.clone(),
            source: e.source,
            installs: e.installs,
            weekly_installs: e.weekly_installs,
            description: e.description.unwrap_or_default(),
        })
        .collect()
}

/// Build the HTTP client used for the one-time index download: a
/// browser-like User-Agent (GitHub can reject or rate limit requests without
/// one) and a generous timeout for the ~5MB index. Cheap to build, and
/// `load_index` caches its result, so this runs at most once per process.
fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("skillone/0.1")
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("failed to build http client: {e}"))
}

/// Download the index (once, then cached) and return all GitHub skills.
async fn load_index() -> Result<Vec<Skill>, String> {
    {
        let guard = index_cache().lock().map_err(|e| e.to_string())?;
        if let Some(skills) = guard.as_ref() {
            return Ok(skills.clone());
        }
    }

    let text = http_client()?
        .get(INDEX_URL)
        .send()
        .await
        .map_err(|e| format!("failed to download index: {e}"))?
        .error_for_status()
        .map_err(|e| format!("index request failed: {e}"))?
        .text()
        .await
        .map_err(|e| format!("failed to read index: {e}"))?;

    let skills = parse_index(&text);

    *index_cache().lock().map_err(|e| e.to_string())? = Some(skills.clone());
    Ok(skills)
}

/// Fetch one page (0-indexed) of skills from the cached index.
#[tauri::command]
async fn fetch_skills_page(page: u64) -> Result<Page, String> {
    let skills = load_index().await?;
    let start = (page as usize) * PAGE_SIZE;
    let end = (start + PAGE_SIZE).min(skills.len());

    Ok(Page {
        skills: if start >= skills.len() {
            Vec::new()
        } else {
            skills[start..end].to_vec()
        },
        has_more: end < skills.len(),
        total: skills.len(),
    })
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            fetch_skills_page,
            skills::install_skill,
            skills::list_installed_skills,
            skills::remove_skills,
            skills::update_skills,
            skills::link_agents,
            skills::link_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_entries_and_defaults_missing_description() {
        let text = concat!(
            r#"{"skillId":"find-skills","weeklyInstalls":[1,2],"installs":3,"source":"vercel-labs/skills","description":"helps you"}"#,
            "\n",
            r#"{"skillId":"no-desc","weeklyInstalls":[],"installs":4,"source":"owner/repo"}"#,
            "\n",
        );
        let skills = parse_index(text);
        assert_eq!(skills.len(), 2);
        assert_eq!(skills[0].skill_id, "find-skills");
        assert_eq!(skills[0].name, "find-skills");
        assert_eq!(skills[0].description, "helps you");
        assert_eq!(skills[1].description, "");
    }

    #[test]
    fn skips_non_github_sources() {
        let text = concat!(
            r#"{"skillId":"ok","weeklyInstalls":[],"installs":1,"source":"owner/repo"}"#,
            "\n",
            r#"{"skillId":"feishu","weeklyInstalls":[],"installs":1,"source":"open.feishu.cn/skills"}"#,
            "\n",
        );
        let skills = parse_index(text);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].skill_id, "ok");
    }

    #[test]
    fn skips_blank_and_malformed_lines() {
        let text = concat!(
            r#"{"skillId":"ok","weeklyInstalls":[],"installs":1,"source":"owner/repo"}"#,
            "\n",
            "\n",
            "this is not json\n",
        );
        let skills = parse_index(text);
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].skill_id, "ok");
    }
}
