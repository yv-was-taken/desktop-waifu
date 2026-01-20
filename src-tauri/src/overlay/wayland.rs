use std::path::PathBuf;
use std::process::Command;

const OVERLAY_BINARY_NAME: &str = "desktop-waifu-overlay";

/// Find the overlay binary by searching common locations
fn find_overlay_binary() -> Option<PathBuf> {
    // Search paths in priority order
    let search_paths: Vec<PathBuf> = vec![
        // Development: relative to project root (when running from src-tauri)
        PathBuf::from("../desktop-waifu-overlay/target/release").join(OVERLAY_BINARY_NAME),
        PathBuf::from("../desktop-waifu-overlay/target/debug").join(OVERLAY_BINARY_NAME),
        // Development: when running from project root
        PathBuf::from("desktop-waifu-overlay/target/release").join(OVERLAY_BINARY_NAME),
        PathBuf::from("desktop-waifu-overlay/target/debug").join(OVERLAY_BINARY_NAME),
        // Same directory as the current executable (bundled)
        std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|p| p.join(OVERLAY_BINARY_NAME)))
            .unwrap_or_default(),
        // System paths
        PathBuf::from("/usr/bin").join(OVERLAY_BINARY_NAME),
        PathBuf::from("/usr/local/bin").join(OVERLAY_BINARY_NAME),
    ];

    for path in search_paths {
        if path.exists() && path.is_file() {
            // Verify it's executable
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if let Ok(metadata) = path.metadata() {
                    if metadata.permissions().mode() & 0o111 != 0 {
                        return Some(path);
                    }
                }
            }
            #[cfg(not(unix))]
            {
                return Some(path);
            }
        }
    }

    None
}

/// Check if the overlay binary is available
pub fn is_overlay_available() -> bool {
    find_overlay_binary().is_some()
}

/// Launch the overlay binary and exit the Tauri process
pub fn launch_overlay_and_exit() -> Result<(), String> {
    let binary_path = find_overlay_binary()
        .ok_or_else(|| "Overlay binary not found".to_string())?;

    println!("[Tauri] Launching overlay binary: {:?}", binary_path);

    // Spawn the overlay process
    let result = Command::new(&binary_path)
        .spawn()
        .map_err(|e| format!("Failed to launch overlay: {}", e))?;

    println!("[Tauri] Overlay process started with PID: {}", result.id());

    // Exit the Tauri process - the overlay will run independently
    std::process::exit(0);
}
