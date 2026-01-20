//! Cross-platform overlay API for desktop pet functionality.
//!
//! This module provides platform-specific implementations for:
//! - Click-through windows (input passes through to apps behind)
//! - Input region control (selective areas accept input)
//! - Always-on-top behavior
//! - Window movement without decorations

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(all(unix, not(target_os = "macos")))]
mod x11;

#[cfg(all(unix, not(target_os = "macos")))]
mod wayland;

use tauri::{Runtime, Window};

/// Check if running on Wayland (Linux only)
#[cfg(all(unix, not(target_os = "macos")))]
pub fn is_wayland() -> bool {
    std::env::var("XDG_SESSION_TYPE")
        .map(|v| v == "wayland")
        .unwrap_or(false)
        || std::env::var("WAYLAND_DISPLAY").is_ok()
}

#[cfg(not(all(unix, not(target_os = "macos"))))]
pub fn is_wayland() -> bool {
    false
}

/// Enable or disable click-through for the entire window.
/// When enabled, mouse events pass through to windows behind.
#[tauri::command]
pub fn set_click_through<R: Runtime>(window: Window<R>, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::set_click_through(&window, enabled)
    }

    #[cfg(target_os = "windows")]
    {
        windows::set_click_through(&window, enabled)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if is_wayland() {
            // Wayland uses the separate gtk4-layer-shell binary
            Err("Click-through on Wayland is handled by the overlay binary".to_string())
        } else {
            x11::set_click_through(&window, enabled)
        }
    }
}

/// Set a specific rectangular region that accepts input.
/// Areas outside this region will be click-through.
#[tauri::command]
pub fn set_input_region<R: Runtime>(
    window: Window<R>,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::set_input_region(&window, x, y, width, height)
    }

    #[cfg(target_os = "windows")]
    {
        windows::set_input_region(&window, x, y, width, height)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if is_wayland() {
            Err("Input region on Wayland is handled by the overlay binary".to_string())
        } else {
            x11::set_input_region(&window, x, y, width, height)
        }
    }
}

/// Clear the input region, making the entire window accept input.
#[tauri::command]
pub fn clear_input_region<R: Runtime>(window: Window<R>) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::clear_input_region(&window)
    }

    #[cfg(target_os = "windows")]
    {
        windows::clear_input_region(&window)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if is_wayland() {
            Err("Input region on Wayland is handled by the overlay binary".to_string())
        } else {
            x11::clear_input_region(&window)
        }
    }
}

/// Enable overlay mode for the window (transparent, always-on-top, no decorations).
#[tauri::command]
pub fn set_overlay_mode<R: Runtime>(window: Window<R>, enabled: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        macos::set_overlay_mode(&window, enabled)
    }

    #[cfg(target_os = "windows")]
    {
        windows::set_overlay_mode(&window, enabled)
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        if is_wayland() {
            Err("Overlay mode on Wayland is handled by the overlay binary".to_string())
        } else {
            x11::set_overlay_mode(&window, enabled)
        }
    }
}

/// Move the window to absolute screen coordinates.
#[tauri::command]
pub fn move_window<R: Runtime>(window: Window<R>, x: i32, y: i32) -> Result<(), String> {
    window
        .set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }))
        .map_err(|e| format!("Failed to move window: {}", e))
}

/// Resize the window.
#[tauri::command]
pub fn resize_window<R: Runtime>(window: Window<R>, width: u32, height: u32) -> Result<(), String> {
    window
        .set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
        .map_err(|e| format!("Failed to resize window: {}", e))
}

/// Get current window position.
#[tauri::command]
pub fn get_window_position<R: Runtime>(window: Window<R>) -> Result<(i32, i32), String> {
    let pos = window
        .outer_position()
        .map_err(|e| format!("Failed to get window position: {}", e))?;
    Ok((pos.x, pos.y))
}

/// Get primary monitor dimensions.
#[tauri::command]
pub fn get_screen_size<R: Runtime>(window: Window<R>) -> Result<(u32, u32), String> {
    let monitor = window
        .primary_monitor()
        .map_err(|e| format!("Failed to get primary monitor: {}", e))?
        .ok_or_else(|| "No primary monitor found".to_string())?;
    let size = monitor.size();
    Ok((size.width, size.height))
}

/// Check if running on Wayland (exposed to frontend).
#[tauri::command]
pub fn check_wayland() -> bool {
    is_wayland()
}
