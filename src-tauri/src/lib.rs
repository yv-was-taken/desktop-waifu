mod overlay;

use serde::{Deserialize, Serialize};
use std::process::Stdio;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub distro: Option<String>,
    pub shell: Option<String>,
    pub package_manager: Option<String>,
}

/// Gets system information for context in LLM prompts
#[tauri::command]
async fn get_system_info() -> Result<SystemInfo, String> {
    let os = std::env::consts::OS.to_string();
    let arch = std::env::consts::ARCH.to_string();

    let mut info = SystemInfo {
        os: os.clone(),
        arch,
        distro: None,
        shell: None,
        package_manager: None,
    };

    // Get shell from environment
    info.shell = std::env::var("SHELL").ok();

    // Linux-specific info
    if os == "linux" {
        // Try to get distro from /etc/os-release
        if let Ok(output) = Command::new("sh")
            .arg("-c")
            .arg("cat /etc/os-release 2>/dev/null | grep -E '^(NAME|ID)=' | head -2")
            .output()
            .await
        {
            let content = String::from_utf8_lossy(&output.stdout);
            for line in content.lines() {
                if line.starts_with("NAME=") {
                    info.distro = Some(line.trim_start_matches("NAME=").trim_matches('"').to_string());
                }
            }
        }

        // Detect package manager
        let pkg_managers = [
            ("apt", "apt"),
            ("dnf", "dnf"),
            ("yum", "yum"),
            ("pacman", "pacman"),
            ("zypper", "zypper"),
            ("apk", "apk"),
            ("nix-env", "nix"),
        ];

        for (cmd, name) in pkg_managers {
            if let Ok(output) = Command::new("which").arg(cmd).output().await {
                if output.status.success() {
                    info.package_manager = Some(name.to_string());
                    break;
                }
            }
        }
    } else if os == "macos" {
        info.distro = Some("macOS".to_string());
        // Check for homebrew
        if let Ok(output) = Command::new("which").arg("brew").output().await {
            if output.status.success() {
                info.package_manager = Some("homebrew".to_string());
            }
        }
    }

    Ok(info)
}

/// Executes a shell command and returns the output.
#[tauri::command]
async fn execute_command(cmd: String) -> Result<CommandOutput, String> {
    println!("[Tauri] execute_command called with: {}", cmd);

    let output = Command::new("sh")
        .arg("-c")
        .arg(&cmd)
        .output()
        .await
        .map_err(|e| {
            eprintln!("[Tauri] Command execution failed: {}", e);
            format!("Failed to execute command: {}", e)
        })?;

    let result = CommandOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    };

    println!("[Tauri] Command completed with exit code: {}", result.exit_code);
    println!("[Tauri] stdout length: {}, stderr length: {}", result.stdout.len(), result.stderr.len());

    Ok(result)
}

/// Executes a shell command and streams output line by line via Tauri events.
#[tauri::command]
async fn execute_command_stream(
    window: tauri::Window,
    cmd: String,
) -> Result<CommandOutput, String> {
    let mut child = Command::new("sh")
        .arg("-c")
        .arg(&cmd)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn command: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();

    let mut full_stdout = String::new();
    let mut full_stderr = String::new();

    // Read stdout lines and emit events
    while let Ok(Some(line)) = stdout_reader.next_line().await {
        full_stdout.push_str(&line);
        full_stdout.push('\n');
        let _ = window.emit("command-stdout", &line);
    }

    // Read stderr lines and emit events
    while let Ok(Some(line)) = stderr_reader.next_line().await {
        full_stderr.push_str(&line);
        full_stderr.push('\n');
        let _ = window.emit("command-stderr", &line);
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for command: {}", e))?;

    let exit_code = status.code().unwrap_or(-1);
    let _ = window.emit("command-complete", exit_code);

    Ok(CommandOutput {
        stdout: full_stdout,
        stderr: full_stderr,
        exit_code,
    })
}

// Keep the original greet command for compatibility
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Check if running on Wayland
    if overlay::is_wayland() {
        println!("[Tauri] Wayland detected, launching overlay binary...");

        if !overlay::is_overlay_available() {
            eprintln!("Error: Wayland overlay binary not found.");
            eprintln!("Build with: cargo build --manifest-path desktop-waifu-overlay/Cargo.toml --release");
            std::process::exit(1);
        }

        if let Err(e) = overlay::launch_overlay_and_exit() {
            eprintln!("Error launching overlay: {}", e);
            std::process::exit(1);
        }
        return;
    }

    // Not on Wayland - show error and exit
    eprintln!("Error: Desktop Waifu requires Wayland.");
    eprintln!("Supported: Sway, Hyprland, GNOME (Wayland), KDE Plasma (Wayland)");
    std::process::exit(1);
}
