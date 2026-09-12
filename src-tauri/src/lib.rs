// Skill One — minimal Tauri entry. All network reads (skills index, SKILL.md)
// happen in the frontend via CORS-enabled CDN mirrors (JSDMirror / jsDelivr);
// the Rust side only exposes local skills install / agent management, plus the
// menu bar tray and its popover window (see `tray.rs`).

use tauri::{Listener, Manager};

mod skills;
mod tray;
mod update_channel;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Self-update: `updater` fetches/verifies/installs signed artifacts from
        // GitHub Releases; `process` lets the frontend relaunch after install.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Native panel material for the menu bar popover (Liquid Glass on
        // macOS 26+, NSVisualEffectView fallback on older macOS, no-op else).
        .plugin(tauri_plugin_liquid_glass::init())
        .manage(tray::PopoverState::default())
        .invoke_handler(tauri::generate_handler![
            skills::install_skill,
            skills::list_installed_skills,
            skills::remove_skills,
            skills::set_skills_enabled,
            skills::link_agents,
            skills::link_status,
            skills::read_skill_md,
            update_channel::is_homebrew_install,
        ])
        .setup(|app| {
            tray::create_tray(app.handle())?;
            // Native popover material, rounded to the CSS corner radius of the
            // content clip (see `POPOVER_MATERIAL_RADIUS` in `tray.rs`).
            #[cfg(target_os = "macos")]
            if let Some(popover) = app.get_webview_window(tray::POPOVER_WINDOW_LABEL) {
                tray::apply_popover_material(app.handle(), &popover);
            }
            // A popover navigation request shows + focuses the main window;
            // the main window's own listener performs the actual routing.
            let handle = app.handle().clone();
            app.listen_any(tray::NAVIGATE_EVENT, move |_| tray::show_main(&handle));
            Ok(())
        })
        .on_window_event(tray::handle_window_event)
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Clicking the dock icon while running must bring the main window
            // back (it hides on close instead of quitting). `Reopen` is
            // macOS-only. We don't trust `has_visible_windows`: the tray
            // popover is itself a visible window, so the flag can be true
            // while the main window is hidden.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                tray::show_main(app_handle);
            }
        });
}
