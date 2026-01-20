//! Wayland support via hybrid launcher approach.
//!
//! Wayland compositors don't allow applications to:
//! - Position windows at specific screen coordinates
//! - Set windows as always-on-top (layer-shell protocol required)
//! - Create click-through regions (layer-shell protocol required)
//!
//! Instead of trying to implement layer-shell in Tauri, we detect Wayland
//! at runtime and launch the separate gtk4-layer-shell based overlay binary
//! which provides full desktop pet functionality on Wayland.

use std::path::PathBuf;
use std::process::{Child, Command};

/// Path to the Wayland overlay binary (relative to the Tauri app).
const OVERLAY_BINARY_NAME: &str = "desktop-waifu-overlay";

/// Find the Wayland overlay binary.
/// Searches in common locations relative to the Tauri executable.
pub fn find_overlay_binary() -> Option<PathBuf> {
    // Try to find the binary in various locations
    let locations = [
        // Development: target directory
        PathBuf::from("../desktop-waifu-overlay/target/debug").join(OVERLAY_BINARY_NAME),
        PathBuf::from("../desktop-waifu-overlay/target/release").join(OVERLAY_BINARY_NAME),
        // Installed: same directory as Tauri app
        std::env::current_exe()
            .ok()?
            .parent()?
            .join(OVERLAY_BINARY_NAME),
        // Installed: libexec directory
        std::env::current_exe()
            .ok()?
            .parent()?
            .parent()?
            .join("libexec")
            .join(OVERLAY_BINARY_NAME),
        // System-wide installation
        PathBuf::from("/usr/bin").join(OVERLAY_BINARY_NAME),
        PathBuf::from("/usr/local/bin").join(OVERLAY_BINARY_NAME),
    ];

    for path in locations {
        if path.exists() && path.is_file() {
            return Some(path);
        }
    }

    None
}

/// Launch the Wayland overlay binary.
/// Returns the child process handle for lifecycle management.
pub fn launch_overlay() -> Result<Child, String> {
    let binary_path = find_overlay_binary()
        .ok_or_else(|| format!("Could not find {} binary", OVERLAY_BINARY_NAME))?;

    Command::new(&binary_path)
        .spawn()
        .map_err(|e| format!("Failed to launch Wayland overlay: {}", e))
}

/// Check if the Wayland overlay binary is available.
pub fn is_overlay_available() -> bool {
    find_overlay_binary().is_some()
}
