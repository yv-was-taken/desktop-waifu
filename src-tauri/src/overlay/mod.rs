mod wayland;

/// Check if the current session is running on Wayland
pub fn is_wayland() -> bool {
    std::env::var("XDG_SESSION_TYPE")
        .map(|v| v == "wayland")
        .unwrap_or(false)
        || std::env::var("WAYLAND_DISPLAY").is_ok()
}

/// Tauri command to check if running on Wayland (callable from frontend)
#[tauri::command]
pub fn check_wayland() -> bool {
    is_wayland()
}

/// Launch the overlay binary and exit the Tauri process
pub fn launch_overlay_and_exit() -> Result<(), String> {
    wayland::launch_overlay_and_exit()
}

/// Check if the overlay binary is available
pub fn is_overlay_available() -> bool {
    wayland::is_overlay_available()
}
