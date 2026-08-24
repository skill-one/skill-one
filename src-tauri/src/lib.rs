// Skillone — minimal Tauri entry. All network reads (skills index, SKILL.md)
// happen in the frontend via CORS-enabled CDN mirrors (JSDMirror / jsDelivr);
// the Rust side only exposes local skills install / agent management.

mod skills;

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
