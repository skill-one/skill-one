// Skill One — minimal Tauri entry. All network reads (skills index, SKILL.md)
// happen in the frontend via CORS-enabled CDN mirrors (JSDMirror / jsDelivr);
// the Rust side only exposes local skills install / agent management.

mod skills;

/// Open a directory's contents in the system file manager. Wrapped as a Tauri
/// command instead of calling the opener plugin directly from JS, because the
/// plugin's `openPath` only accepts paths covered by an ACL scope — which we
/// cannot declare for the agent skills dirs ahead of time. Called internally,
/// `opener().open_path` is not subject to the ACL gate and navigates into the
/// folder (not just reveals it in its parent).
#[tauri::command]
fn open_directory(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            skills::install_skill,
            skills::list_installed_skills,
            skills::remove_skills,
            skills::update_skills,
            skills::disable_skills,
            skills::enable_skills,
            skills::link_agents,
            skills::link_status,
            skills::remove_stray_files,
            open_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
