//! IPC module for communication with the main Tauri application
//!
//! Uses Unix sockets for bidirectional communication.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

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
