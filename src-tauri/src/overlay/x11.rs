//! X11-specific overlay implementation using XShape extension.
//!
//! Uses XShape to define input regions and _NET_WM_STATE_ABOVE for always-on-top.
//!
//! Note: Full XShape support requires access to the raw X11 window ID, which
//! Tauri doesn't expose directly. For now, we use Tauri's built-in methods
//! where possible, with stubs for full XShape functionality that can be
//! enabled later with raw-window-handle support.

use tauri::{Runtime, Window};

// XShape and X11 types are available for future use when raw window access is added:
// use x11rb::connection::Connection;
// use x11rb::protocol::shape::{self, ConnectionExt as ShapeConnectionExt, SK};
// use x11rb::protocol::xproto::{Atom, ConnectionExt, Rectangle};
// use x11rb::rust_connection::RustConnection;

/// Enable or disable click-through for the entire window using XShape.
/// When enabled, sets an empty input shape so all events pass through.
pub fn set_click_through<R: Runtime>(window: &Window<R>, enabled: bool) -> Result<(), String> {
    // For X11, we use XShape extension to set input region
    // However, getting the X11 window ID from Tauri requires raw-window-handle
    // As a workaround, we'll use Tauri's ignore_cursor_events
    window
        .set_ignore_cursor_events(enabled)
        .map_err(|e| format!("Failed to set click-through: {}", e))
}

/// Set a specific rectangular region that accepts input using XShape.
pub fn set_input_region<R: Runtime>(
    window: &Window<R>,
    _x: i32,
    _y: i32,
    _width: i32,
    _height: i32,
) -> Result<(), String> {
    // Tauri doesn't expose raw X11 window access easily
    // For now, we can only toggle full click-through
    // A proper implementation would use XShape with raw window ID access:
    //
    // let state = X11State::new(window_id)?;
    // let rect = Rectangle {
    //     x: _x as i16,
    //     y: _y as i16,
    //     width: _width as u16,
    //     height: _height as u16,
    // };
    // state.conn.shape_rectangles(
    //     shape::SO::SET,
    //     SK::INPUT,
    //     xproto::ClipOrdering::UNSORTED,
    //     state.window_id,
    //     0, 0,
    //     &[rect],
    // )?;

    // For now, just ensure the window accepts input
    window
        .set_ignore_cursor_events(false)
        .map_err(|e| format!("Failed to set input region: {}", e))
}

/// Clear the input region, making the entire window accept input.
pub fn clear_input_region<R: Runtime>(window: &Window<R>) -> Result<(), String> {
    // Reset to accepting all input
    window
        .set_ignore_cursor_events(false)
        .map_err(|e| format!("Failed to clear input region: {}", e))
}

/// Enable overlay mode for the window.
/// Sets _NET_WM_STATE_ABOVE hint and other EWMH properties.
pub fn set_overlay_mode<R: Runtime>(window: &Window<R>, enabled: bool) -> Result<(), String> {
    if enabled {
        // Use Tauri's built-in methods for common overlay behaviors
        window
            .set_always_on_top(true)
            .map_err(|e| format!("Failed to set always on top: {}", e))?;

        // For more advanced X11 hints (like _NET_WM_STATE_STICKY for all desktops),
        // we would need raw X11 access which requires additional crate features
    } else {
        window
            .set_always_on_top(false)
            .map_err(|e| format!("Failed to unset always on top: {}", e))?;
    }

    Ok(())
}
