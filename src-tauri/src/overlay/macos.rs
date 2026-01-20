//! macOS-specific overlay implementation using Cocoa/AppKit.
//!
//! Uses NSWindow's `setIgnoresMouseEvents` for click-through behavior.
//! Note: macOS doesn't support partial input regions natively, so we use
//! a toggle-based approach where the frontend tracks cursor position and
//! requests click-through state changes based on hitbox detection.

use cocoa::appkit::{NSMainMenuWindowLevel, NSWindow, NSWindowCollectionBehavior};
use cocoa::base::{id, nil, BOOL, NO, YES};
use objc::{msg_send, sel, sel_impl};
use tauri::{Runtime, Window};

/// Get the NSWindow handle from a Tauri window.
fn get_ns_window<R: Runtime>(window: &Window<R>) -> Result<id, String> {
    window
        .ns_window()
        .map(|ptr| ptr as id)
        .map_err(|e| format!("Failed to get NSWindow: {}", e))
}

/// Enable or disable click-through for the entire window.
/// On macOS, this is a binary toggle - the entire window either accepts or ignores mouse events.
pub fn set_click_through<R: Runtime>(window: &Window<R>, enabled: bool) -> Result<(), String> {
    let ns_window = get_ns_window(window)?;

    unsafe {
        let ignores: BOOL = if enabled { YES } else { NO };
        let _: () = msg_send![ns_window, setIgnoresMouseEvents: ignores];
    }

    Ok(())
}

/// Set input region on macOS.
/// Since macOS doesn't support partial input regions, this is a no-op.
/// The frontend should use cursor tracking + set_click_through toggle instead.
pub fn set_input_region<R: Runtime>(
    _window: &Window<R>,
    _x: i32,
    _y: i32,
    _width: i32,
    _height: i32,
) -> Result<(), String> {
    // macOS doesn't support partial input regions natively.
    // The frontend should track cursor position and call set_click_through
    // based on whether the cursor is over an interactive region.
    Ok(())
}

/// Clear input region on macOS (accept input on entire window).
pub fn clear_input_region<R: Runtime>(window: &Window<R>) -> Result<(), String> {
    // Ensure window accepts all input
    set_click_through(window, false)
}

/// Enable overlay mode for the window.
/// Sets appropriate window level and collection behavior for a desktop pet.
pub fn set_overlay_mode<R: Runtime>(window: &Window<R>, enabled: bool) -> Result<(), String> {
    let ns_window = get_ns_window(window)?;

    unsafe {
        if enabled {
            // Set window level above normal windows but below screen saver
            // NSMainMenuWindowLevel (24) is above normal windows
            let _: () = msg_send![ns_window, setLevel: NSMainMenuWindowLevel + 1];

            // Make window appear on all spaces/desktops
            let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
                | NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle;
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

            // Make window non-activating (doesn't steal focus when clicked)
            // This requires the window to use NSWindowStyleMaskNonactivatingPanel
            // which Tauri doesn't support directly, so we rely on setIgnoresMouseEvents toggle

            // Ensure background is transparent
            let _: () = msg_send![ns_window, setOpaque: NO];
            let _: () = msg_send![ns_window, setBackgroundColor: nil];

            // Set alpha value to 1.0 (fully visible but with transparency)
            let _: () = msg_send![ns_window, setAlphaValue: 1.0_f64];

            // Hide from exposé/mission control
            let _: () = msg_send![ns_window, setExcludedFromWindowsMenu: YES];
        } else {
            // Reset to normal window level
            let _: () = msg_send![ns_window, setLevel: 0_i32];

            // Reset collection behavior
            let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorDefault;
            let _: () = msg_send![ns_window, setCollectionBehavior: behavior];

            // Show in windows menu again
            let _: () = msg_send![ns_window, setExcludedFromWindowsMenu: NO];
        }
    }

    Ok(())
}
