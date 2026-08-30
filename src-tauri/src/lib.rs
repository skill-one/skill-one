// Skill One — minimal Tauri entry. All network reads (skills index, SKILL.md)
// happen in the frontend via CORS-enabled CDN mirrors (JSDMirror / jsDelivr);
// the Rust side only exposes local skills install / agent management, plus the
// menu bar tray and its popover window (see `tray.rs`).

use tauri::{Listener, Manager};

mod skills;
mod tray;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(tray::PopoverState::default())
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
        .setup(|app| {
            tray::create_tray(app.handle())?;
            // Native frosted-glass popover material, rounded to match the
            // CSS corner radius of the panel inside.
            #[cfg(target_os = "macos")]
            if let Some(popover) = app.get_webview_window(tray::POPOVER_WINDOW_LABEL) {
                tray::apply_popover_material(&popover, 16.0);
            }
            // A popover navigation request shows + focuses the main window;
            // the main window's own listener performs the actual routing.
            let handle = app.handle().clone();
            app.listen_any(tray::NAVIGATE_EVENT, move |_| tray::show_main(&handle));
            Ok(())
        })
        .on_window_event(tray::handle_window_event)
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
