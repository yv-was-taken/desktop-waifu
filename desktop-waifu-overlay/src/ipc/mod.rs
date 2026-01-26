//! IPC module for communication with the main Tauri application
//!
//! Uses Unix sockets for bidirectional communication.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::os::unix::net::{UnixListener, UnixStream};
use std::path::PathBuf;
use std::sync::mpsc;

/// Commands sent from Tauri to the overlay
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum OverlayCommand {
    /// Set the character's facial expression
    SetExpression(String),
    /// Play an animation
    PlayAnimation(String),
    /// Move the overlay to a new position
    SetPosition { x: i32, y: i32 },
    /// Set the overlay scale
    SetScale(f32),
    /// Show the overlay
    Show,
    /// Hide the overlay
    Hide,
    /// Load a different character model
    LoadModel(PathBuf),
    /// Shutdown the overlay process
    Shutdown,
    /// Set whether the character is "talking" (lip sync animation)
    SetTalking(bool),
    /// Set the current animation state
    SetAnimationState(AnimationState),
}

/// Animation state for the character
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AnimationState {
    Idle,
    Thinking,
    Talking,
    Listening,
}

/// Events sent from overlay to Tauri
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum OverlayEvent {
    /// User clicked on the pet
    Clicked,
    /// An animation completed
    AnimationComplete(String),
    /// Overlay is ready
    Ready,
    /// An error occurred
    Error(String),
}

/// Socket path for IPC
pub fn socket_path() -> PathBuf {
    let uid = unsafe { libc::getuid() };
    PathBuf::from(format!("/run/user/{}/desktop-waifu.sock", uid))
}

/// Send a command to the running instance via Unix socket
pub fn send_command(cmd: &str) -> Result<(), std::io::Error> {
    let socket_path = socket_path();
    crate::debug_log!("[IPC] Connecting to socket at {:?}", socket_path);
    let mut stream = UnixStream::connect(&socket_path)?;
    crate::debug_log!("[IPC] Connected, sending command: {}", cmd);
    stream.write_all(cmd.as_bytes())?;
    crate::debug_log!("[IPC] Command sent successfully");
    Ok(())
}

/// Spawn a socket listener that receives commands from CLI invocations
/// Returns a receiver that yields command strings
pub fn spawn_socket_listener() -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel();
    let socket_path = socket_path();

    // Remove stale socket file if it exists
    let _ = std::fs::remove_file(&socket_path);

    std::thread::spawn(move || {
        crate::debug_log!("[IPC] Binding socket listener at {:?}", socket_path);
        let listener = match UnixListener::bind(&socket_path) {
            Ok(l) => {
                crate::debug_log!("[IPC] Socket listener bound successfully");
                l
            }
            Err(e) => {
                crate::debug_log!("[IPC] Failed to bind socket at {:?}: {}", socket_path, e);
                return;
            }
        };

        crate::debug_log!("[IPC] Waiting for incoming connections...");
        for stream in listener.incoming() {
            if let Ok(mut stream) = stream {
                crate::debug_log!("[IPC] Received incoming connection");
                let mut buf = [0u8; 64];
                if let Ok(n) = stream.read(&mut buf) {
                    let cmd = String::from_utf8_lossy(&buf[..n]).trim().to_string();
                    crate::debug_log!("[IPC] Received command: '{}'", cmd);
                    if tx.send(cmd.clone()).is_err() {
                        crate::debug_log!("[IPC] Receiver dropped, exiting listener thread");
                        break;
                    }
                    crate::debug_log!("[IPC] Command sent to main thread");
                }
            }
        }
    });

    rx
}
