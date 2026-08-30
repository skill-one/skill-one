// Menu bar tray + popover window management.
//
// The tray icon lives in the macOS menu bar: left click toggles a small
// frameless popover window (declared in `tauri.conf.json`, created hidden at
// startup) anchored below the icon; right click opens a native menu with
// open/quit. The popover dismisses itself on focus loss (with a short grace
// window so the toggle click's own blur cannot race the show) and the main
// window hides on close instead of quitting — the tray menu's quit item is
// the only exit.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, PhysicalSize, Position, Rect, Runtime, Size, Window,
    WindowEvent,
};

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const POPOVER_WINDOW_LABEL: &str = "popover";
/// Emitted by the popover when the user wants to open a page in the main
/// window (payload `{ path }`); this side only shows + focuses it, the main
/// window's own listener performs the actual routing.
pub const NAVIGATE_EVENT: &str = "popover-navigate";

/// Ignore popover blur events within this window of a show: clicking the tray
/// icon while the popover is open first steals focus (blur) and only then
/// delivers the click that should toggle it closed.
const BLUR_GRACE: Duration = Duration::from_millis(250);
/// Gap between the menu bar and the popover's top edge.
const POPOVER_GAP: f64 = 6.0;
/// Popover logical size, mirroring `tauri.conf.json` (`width`/`height`).
/// Only used as a fallback when reading the real window size fails.
const POPOVER_LOGICAL_SIZE: (f64, f64) = (320.0, 400.0);

/// Timestamp of the last popover show, shared so the blur handler can apply
/// the grace window.
#[derive(Default)]
pub struct PopoverState {
    shown_at: Mutex<Option<Instant>>,
}

/// Build the menu bar tray icon with its native right-click menu.
pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "打开 SkillOne", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出 SkillOne", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .tooltip("SkillOne")
        // Monochrome template icon: macOS recolors it for light/dark menu bars.
        .icon(Image::from_bytes(include_bytes!("../icons/tray-icon.png"))?)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                position,
                rect,
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_popover(tray.app_handle(), &rect, position);
            }
        })
        .build(app)?;
    Ok(())
}

/// Apply the native frosted-glass popover material (the same
/// `NSVisualEffectView` material system popovers use), with the vibrancy view
/// itself rounded to `radius` points.
#[cfg(target_os = "macos")]
pub fn apply_popover_material(window: &tauri::WebviewWindow, radius: f64) {
    use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

    if let Err(err) = apply_vibrancy(
        window,
        NSVisualEffectMaterial::Popover,
        Some(NSVisualEffectState::FollowsWindowActiveState),
        Some(radius),
    ) {
        eprintln!("failed to apply popover vibrancy: {err}");
    }
}

/// Show + focus the main window (tray menu, popover navigation requests).
pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// Hide-on-close / click-outside dismissal for both managed windows.
pub fn handle_window_event<R: Runtime>(window: &Window<R>, event: &WindowEvent) {
    match event {
        // Closing the main window hides it to the menu bar instead of
        // quitting; the tray menu's quit item is the only real exit.
        WindowEvent::CloseRequested { api, .. } if window.label() == MAIN_WINDOW_LABEL => {
            api.prevent_close();
            let _ = window.hide();
        }
        // Click-outside dismissal: the popover hides as soon as it loses
        // focus — unless the blur was itself triggered by a tray toggle click
        // within the grace window, which would immediately re-show it.
        WindowEvent::Focused(false) if window.label() == POPOVER_WINDOW_LABEL => {
            let within_grace = window
                .app_handle()
                .state::<PopoverState>()
                .shown_at
                .lock()
                .map(|shown_at| {
                    shown_at.is_some_and(|at| at.elapsed() < BLUR_GRACE)
                })
                .unwrap_or(true);
            if !within_grace {
                let _ = window.hide();
            }
        }
        _ => {}
    }
}

/// Show the popover anchored below the tray icon, or hide it when already
/// visible (toggle).
fn toggle_popover<R: Runtime>(app: &AppHandle<R>, rect: &Rect, cursor: PhysicalPosition<f64>) {
    let Some(popover) = app.get_webview_window(POPOVER_WINDOW_LABEL) else {
        return;
    };
    if popover.is_visible().unwrap_or(false) {
        let _ = popover.hide();
        return;
    }

    let scale = popover.scale_factor().unwrap_or(1.0);
    let size = popover.inner_size().unwrap_or(PhysicalSize::new(
        (POPOVER_LOGICAL_SIZE.0 * scale) as u32,
        (POPOVER_LOGICAL_SIZE.1 * scale) as u32,
    ));
    let origin = popover_origin(
        rect_px(rect, scale),
        (size.width as f64, size.height as f64),
        monitor_bounds(app, cursor),
    );
    let _ = popover.set_position(origin);
    let _ = popover.show();
    let _ = popover.set_focus();
    #[cfg(target_os = "macos")]
    activate_app(app);
    if let Ok(mut shown_at) = app.state::<PopoverState>().shown_at.lock() {
        *shown_at = Some(Instant::now());
    }
}

/// Take real app activation, not just a key window: when the popover opens
/// while another app is frontmost, macOS reclaims key focus moments later and
/// the blur-dismiss would hide the popover again.
#[cfg(target_os = "macos")]
fn activate_app<R: Runtime>(app: &AppHandle<R>) {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;

    let _ = app.run_on_main_thread(|| {
        if let Some(mtm) = MainThreadMarker::new() {
            // Deprecated in favor of cooperative `activate()`, but it is the
            // deterministic way to take focus from a tray click.
            #[allow(deprecated)]
            NSApplication::sharedApplication(mtm).activateIgnoringOtherApps(true);
        }
    });
}

/// Top-left origin placing the popover centered under the tray icon, clamped
/// to the monitor so it never leaves the screen.
fn popover_origin(
    tray: (f64, f64, f64, f64),
    popover: (f64, f64),
    monitor: (f64, f64, f64, f64),
) -> PhysicalPosition<i32> {
    let (tray_x, tray_y, tray_w, tray_h) = tray;
    let (popover_w, popover_h) = popover;
    let (mon_x, mon_y, mon_w, mon_h) = monitor;
    let x = tray_x + (tray_w - popover_w) / 2.0;
    let y = tray_y + tray_h + POPOVER_GAP;
    // `.max()` keeps the upper bound sane on monitors smaller than the
    // popover (then the popover sticks to the monitor's left/top edge).
    let x = x.clamp(mon_x, (mon_x + mon_w - popover_w).max(mon_x));
    let y = y.clamp(mon_y, (mon_y + mon_h - popover_h).max(mon_y));
    PhysicalPosition::new(x.round() as i32, y.round() as i32)
}

/// Tray event rects are physical pixels on our platforms; logical values
/// (possible on some Linux backends) are converted with the window's scale
/// factor. Returns `(x, y, width, height)`.
fn rect_px(rect: &Rect, scale: f64) -> (f64, f64, f64, f64) {
    let (x, y) = match rect.position {
        Position::Physical(p) => (p.x as f64, p.y as f64),
        Position::Logical(p) => (p.x * scale, p.y * scale),
    };
    let (w, h) = match rect.size {
        Size::Physical(s) => (s.width as f64, s.height as f64),
        Size::Logical(s) => (s.width * scale, s.height * scale),
    };
    (x, y, w, h)
}

/// Bounds of the monitor under the cursor (tray icons live on one monitor),
/// falling back to the primary monitor and finally to unclamped coordinates.
fn monitor_bounds<R: Runtime>(app: &AppHandle<R>, cursor: PhysicalPosition<f64>) -> (f64, f64, f64, f64) {
    let monitor = app
        .monitor_from_point(cursor.x, cursor.y)
        .ok()
        .flatten()
        .or_else(|| app.primary_monitor().ok().flatten());
    let Some(monitor) = monitor else {
        return (0.0, 0.0, f64::INFINITY, f64::INFINITY);
    };
    let position = monitor.position();
    let size = monitor.size();
    (
        position.x as f64,
        position.y as f64,
        size.width as f64,
        size.height as f64,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Menu bar on a 1440x900 primary monitor, tray icon centered on top.
    fn mac_tray() -> (f64, f64, f64, f64) {
        (712.0, 0.0, 32.0, 24.0)
    }

    /// Matches `POPOVER_LOGICAL_SIZE` / `tauri.conf.json`.
    fn popover_size() -> (f64, f64) {
        (320.0, 400.0)
    }

    fn monitor() -> (f64, f64, f64, f64) {
        (0.0, 0.0, 1440.0, 900.0)
    }

    #[test]
    fn centers_below_the_tray_icon() {
        let origin = popover_origin(mac_tray(), popover_size(), monitor());
        assert_eq!(origin.x, 568); // 712 + (32 - 320) / 2
        assert_eq!(origin.y, 30); // 0 + 24 + gap 6
    }

    #[test]
    fn clamps_to_the_right_screen_edge() {
        let tray = (1400.0, 0.0, 32.0, 24.0);
        let origin = popover_origin(tray, popover_size(), monitor());
        assert_eq!(origin.x, 1120); // 1440 - 320
        assert_eq!(origin.y, 30);
    }

    #[test]
    fn clamps_to_the_left_screen_edge() {
        let tray = (0.0, 0.0, 32.0, 24.0);
        let origin = popover_origin(tray, popover_size(), monitor());
        assert_eq!(origin.x, 0);
    }

    #[test]
    fn clamps_to_the_bottom_screen_edge() {
        let tray = (712.0, 876.0, 32.0, 24.0); // dock-position tray (unrealistic but exercises the clamp)
        let origin = popover_origin(tray, popover_size(), monitor());
        assert_eq!(origin.y, 500); // 900 - 400
    }

    #[test]
    fn rounds_fractional_positions() {
        let origin = popover_origin((713.0, 0.0, 31.0, 24.0), popover_size(), monitor());
        assert_eq!(origin.x, 569); // 713 + (31 - 320) / 2 = 568.5
    }
}
