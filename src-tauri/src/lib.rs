// Skill One — minimal Tauri entry. All network reads (skills index, SKILL.md)
// happen in the frontend via CORS-enabled CDN mirrors (JSDMirror / jsDelivr);
// the Rust side only exposes local skills install / agent management.

mod activity;
mod dir_fingerprint;
mod provenance;
mod skills;
mod update_channel;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // The skills.sh live search: its endpoint serves no CORS headers, so
        // the request is made from Rust instead of the webview. The allowed
        // origin is the capability's business (`capabilities/default.json`).
        .plugin(tauri_plugin_http::init())
        // Self-update: `updater` fetches/verifies/installs signed artifacts from
        // GitHub Releases; `process` lets the frontend relaunch after install.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            skills::install_skill,
            skills::list_installed_skills,
            skills::remove_skills,
            skills::set_skills_enabled,
            skills::link_agents,
            skills::link_status,
            skills::read_skill_md,
            skills::write_skill_md,
            skills::open_skill_dir,
            skills::skill_fingerprint,
            provenance::read_provenance,
            provenance::write_provenance,
            provenance::open_provenance_dir,
            activity::append_activity,
            activity::read_activity,
            activity::clear_activity,
            activity::open_activity_dir,
            update_channel::is_homebrew_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
