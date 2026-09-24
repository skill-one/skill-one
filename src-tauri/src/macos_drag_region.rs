use objc2::rc::Retained;
use objc2::{define_class, msg_send, MainThreadOnly};
use objc2_app_kit::{NSAutoresizingMaskOptions, NSEvent, NSView, NSWindow};
use objc2_foundation::{MainThreadMarker, NSPoint, NSRect, NSSize};

const HEADER_HEIGHT: f64 = 40.0;
// Mirrors the 96pt header inset, 224pt search field, and 12pt gap.
const LEFT_DRAG_INSET: f64 = 344.0;
// Leaves the 32pt header inset, unit switch, and a 12pt gap untouched.
const RIGHT_DRAG_INSET: f64 = 128.0;

define_class!(
    // SAFETY: NSView has no subclassing requirements for mouseDownCanMoveWindow.
    #[unsafe(super = NSView)]
    #[thread_kind = MainThreadOnly]
    struct HeaderDragRegion;

    impl HeaderDragRegion {
        #[unsafe(method(mouseDownCanMoveWindow))]
        fn mouse_down_can_move_window(&self) -> bool {
            true
        }

        #[unsafe(method(mouseDown:))]
        fn mouse_down(&self, event: &NSEvent) {
            if let Some(window) = self.window() {
                window.performWindowDragWithEvent(event);
            }
        }
    }
);

/// Adds a native, centered drag target over the non-interactive part of the
/// custom header. AppKit owns the gesture, so macOS accessibility dragging is
/// available without changing the React header appearance or controls.
pub fn install(window: &NSWindow) {
    let marker = MainThreadMarker::new().expect("window setup must run on the main thread");
    let content_view = window
        .contentView()
        .expect("window must have a content view");
    let content_size = content_view.frame().size;
    let frame = NSRect::new(
        NSPoint::new(LEFT_DRAG_INSET, content_size.height - HEADER_HEIGHT),
        NSSize::new(
            content_size.width - LEFT_DRAG_INSET - RIGHT_DRAG_INSET,
            HEADER_HEIGHT,
        ),
    );
    let region = HeaderDragRegion::alloc(marker);
    let region: Retained<HeaderDragRegion> = unsafe { msg_send![region, initWithFrame: frame] };

    region.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewMinYMargin,
    );
    content_view.addSubview(&region);
}
