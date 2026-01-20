mod ipc;
mod tray;

// Debug logging flag - set to true to enable debug output to terminal
const DEBUG_LOGGING: bool = true;

// Helper macro for conditional debug logging
macro_rules! debug_log {
    ($($arg:tt)*) => {
        if DEBUG_LOGGING {
            println!($($arg)*);
        }
    };
}

use anyhow::Result;
use cairo::{RectangleInt, Region};
use gtk4::{gio, glib};
use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow};
use gtk4_layer_shell::{Edge, KeyboardMode, Layer, LayerShell as _};
use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;
use webkit6::prelude::*;
use webkit6::{Settings as WebViewSettings, UserContentManager, WebView};

use tray::{spawn_tray, update_tray_visibility, TrayMessage};

const APP_ID: &str = "com.desktop-waifu.overlay";

// Window dimension constants
const WINDOW_WIDTH_COLLAPSED: i32 = 160;   // Character only
const WINDOW_WIDTH_EXPANDED: i32 = 800;    // Chat + Character
const WINDOW_HEIGHT_COLLAPSED: i32 = 380;  // Character only
const WINDOW_HEIGHT_EXPANDED: i32 = 1000;  // Chat + Character (more room for chat)

// Store character position (absolute screen coordinates)
// With fullscreen window, character is positioned via CSS within the window
#[derive(Clone, Debug)]
struct CharacterPosition {
    // X coordinate of character's left edge on screen
    x: i32,
    // Y coordinate of character's top edge on screen
    y: i32,
}

impl Default for CharacterPosition {
    fn default() -> Self {
        // Default to bottom-right area of a 1920x1080 screen
        Self {
            x: 1920 - WINDOW_WIDTH_COLLAPSED - 20,
            y: 1080 - WINDOW_HEIGHT_COLLAPSED - 20,
        }
    }
}

// Screen quadrant information
#[derive(Clone, Debug, Default)]
struct Quadrant {
    is_right_half: bool,
    is_bottom_half: bool,
}

// Store drag state
#[derive(Clone, Debug, Default)]
struct DragState {
    start_x: i32,
    start_y: i32,
    is_dragging: bool,
}


/// Get screen dimensions from the monitor containing the window
fn get_screen_dimensions(window: &ApplicationWindow) -> Option<(i32, i32)> {
    let display = gtk4::gdk::Display::default()?;
    let surface = window.surface()?;
    let monitor = display.monitor_at_surface(&surface)?;
    let geometry = monitor.geometry();
    Some((geometry.width(), geometry.height()))
}

fn main() -> Result<()> {
    // Initialize logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::DEBUG)
        .finish();
    tracing::subscriber::set_global_default(subscriber)?;

    info!("Starting desktop-waifu-overlay");

    // Create GTK application
    let app = Application::builder()
        .application_id(APP_ID)
        .build();

    app.connect_activate(build_ui);

    // Run the application
    let exit_code = app.run();

    if exit_code != glib::ExitCode::SUCCESS {
        anyhow::bail!("Application exited with error code");
    }

    Ok(())
}

fn build_ui(app: &Application) {
    // Create the main window (start with character-only size, expands when chat opens)
    let window = ApplicationWindow::builder()
        .application(app)
        .title("Desktop Waifu Overlay")
        .default_width(WINDOW_WIDTH_COLLAPSED)
        .default_height(WINDOW_HEIGHT_COLLAPSED)
        .build();

    // Set up CSS for transparency
    let css_provider = gtk4::CssProvider::new();
    css_provider.load_from_data(
        "window, window.background { background-color: transparent; }",
    );
    gtk4::style_context_add_provider_for_display(
        &gtk4::gdk::Display::default().expect("No display"),
        &css_provider,
        gtk4::STYLE_PROVIDER_PRIORITY_APPLICATION,
    );

    // Initialize layer shell for this window
    window.init_layer_shell();

    // Configure layer shell properties
    // Use OVERLAY layer (above everything)
    window.set_layer(Layer::Overlay);

    // Anchor to ALL edges (fullscreen window)
    // This makes the window cover the entire screen
    window.set_anchor(Edge::Top, true);
    window.set_anchor(Edge::Bottom, true);
    window.set_anchor(Edge::Left, true);
    window.set_anchor(Edge::Right, true);

    // Character position (absolute screen coordinates)
    let position = Rc::new(RefCell::new(CharacterPosition::default()));

    // Drag state
    let drag_state = Rc::new(RefCell::new(DragState::default()));

    // Quadrant state (initially bottom-right)
    let quadrant = Rc::new(RefCell::new(Quadrant {
        is_right_half: true,
        is_bottom_half: true,
    }));

    // No margins needed - window is fullscreen
    window.set_margin(Edge::Top, 0);
    window.set_margin(Edge::Bottom, 0);
    window.set_margin(Edge::Left, 0);
    window.set_margin(Edge::Right, 0);

    // Don't reserve exclusive space
    window.set_exclusive_zone(-1);

    // Allow keyboard focus when user clicks on the overlay (for text input)
    window.set_keyboard_mode(KeyboardMode::OnDemand);

    // Set namespace for compositor identification
    window.set_namespace(Some("desktop-waifu"));

    info!("Layer shell configured: OVERLAY layer, bottom-right anchor");

    // Spawn system tray
    let (tray_receiver, tray_handle) = match spawn_tray() {
        Ok((rx, handle)) => (Some(rx), Some(handle)),
        Err(e) => {
            tracing::warn!("Failed to spawn system tray: {}. Continuing without tray.", e);
            (None, None)
        }
    };

    // Create WebView with message handler for drag events and window control
    let webview = create_webview_with_handlers(&window, position, drag_state, quadrant, tray_handle.clone());

    // Add WebView to window
    window.set_child(Some(&webview));

    // Set up keyboard focus handler (needs access to webview)
    let content_manager = webview.user_content_manager().unwrap();
    content_manager.register_script_message_handler("keyboardFocus", None);

    let webview_for_focus = webview.clone();
    content_manager.connect_script_message_received(Some("keyboardFocus"), move |_manager, _js_value| {
        debug_log!("[FOCUS] Keyboard focus requested, grabbing focus");
        webview_for_focus.grab_focus();
    });

    // Set up tray message handler on GTK main loop
    if let Some(receiver) = tray_receiver {
        let window_for_tray = window.clone();
        let webview_for_tray = webview.clone();
        let tray_handle_for_update = tray_handle.clone();

        // Poll for tray messages every 100ms
        glib::timeout_add_local(Duration::from_millis(100), move || {
            while let Ok(msg) = receiver.try_recv() {
                match msg {
                    TrayMessage::Show => {
                        window_for_tray.present();
                        webview_for_tray.evaluate_javascript(
                            "window.dispatchEvent(new CustomEvent('trayShow'))",
                            None,
                            None,
                            None::<&gio::Cancellable>,
                            |_| {},
                        );
                        if let Some(ref handle) = tray_handle_for_update {
                            update_tray_visibility(handle, true);
                        }
                    }
                    TrayMessage::Hide => {
                        window_for_tray.hide();
                        if let Some(ref handle) = tray_handle_for_update {
                            update_tray_visibility(handle, false);
                        }
                    }
                    TrayMessage::Quit => {
                        window_for_tray.close();
                        return glib::ControlFlow::Break;
                    }
                }
            }
            glib::ControlFlow::Continue
        });
    }

    // Load from Vite dev server - add ?overlay=true to enable overlay mode
    let dev_url = "http://localhost:1420?overlay=true";
    webview.load_uri(dev_url);
    info!("Loading WebView from: {}", dev_url);

    // When window loses focus (user clicks away), switch to OnDemand mode
    // so other apps can receive keyboard input.
    window.connect_is_active_notify(|w| {
        if !w.is_active() {
            w.set_keyboard_mode(KeyboardMode::OnDemand);
        }
    });

    // Show the window
    window.present();

    info!("Overlay window created and presented");
}

fn create_webview_with_handlers(
    window: &ApplicationWindow,
    position: Rc<RefCell<CharacterPosition>>,
    drag_state: Rc<RefCell<DragState>>,
    quadrant: Rc<RefCell<Quadrant>>,
    tray_handle: Option<ksni::Handle<tray::DesktopWaifuTray>>,
) -> WebView {
    // Create WebView settings
    let settings = WebViewSettings::new();

    // Enable developer tools for debugging
    settings.set_enable_developer_extras(true);

    // Enable WebGL for Three.js
    settings.set_enable_webgl(true);

    // Enable JavaScript
    settings.set_enable_javascript(true);

    // Allow file access from file URLs (for loading local assets)
    settings.set_allow_file_access_from_file_urls(true);
    settings.set_allow_universal_access_from_file_urls(true);

    // Enable smooth scrolling
    settings.set_enable_smooth_scrolling(true);

    // Create UserContentManager for handling JavaScript messages
    let content_manager = UserContentManager::new();

    // Register the "moveWindow" message handler
    content_manager.register_script_message_handler("moveWindow", None);

    // Register the "windowControl" message handler for hide/show
    content_manager.register_script_message_handler("windowControl", None);

    // Register the "resizeWindow" message handler for dynamic width adjustment
    content_manager.register_script_message_handler("resizeWindow", None);

    // Register the "executeCommand" message handler for shell command execution
    content_manager.register_script_message_handler("executeCommand", None);

    // Register the "getSystemInfo" message handler
    content_manager.register_script_message_handler("getSystemInfo", None);

    // Register the "debug" message handler for JS debug logging
    content_manager.register_script_message_handler("debug", None);

    // Register the "getQuadrant" message handler for initial quadrant state
    content_manager.register_script_message_handler("getQuadrant", None);

    // Register the "setInputRegion" message handler for click-through control
    content_manager.register_script_message_handler("setInputRegion", None);


    // Clone window for windowControl handler
    let window_for_control = window.clone();

    // Connect to the script-message-received signal for window control (hide/show)
    content_manager.connect_script_message_received(Some("windowControl"), move |_manager, js_value| {
        if let Some(json_str) = js_value.to_json(0) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                let action = parsed["action"].as_str().unwrap_or("");

                match action {
                    "hide" => {
                        // Wait for the hide animation to complete (800ms), then hide window
                        let win = window_for_control.clone();
                        let handle = tray_handle.clone();
                        glib::timeout_add_local_once(Duration::from_millis(800), move || {
                            win.hide();
                            if let Some(ref h) = handle {
                                update_tray_visibility(h, false);
                            }
                        });
                    }
                    "show" => {
                        window_for_control.present();
                        if let Some(ref handle) = tray_handle {
                            update_tray_visibility(handle, true);
                        }
                    }
                    _ => {}
                }
            }
        }
    });

    // Clone window for resizeWindow handler
    let window_for_resize = window.clone();

    // Connect to the script-message-received signal for window resize
    content_manager.connect_script_message_received(Some("resizeWindow"), move |_manager, js_value| {
        if let Some(json_str) = js_value.to_json(0) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                let action = parsed["action"].as_str().unwrap_or("");

                match action {
                    "resize" => {
                        let width = parsed["width"].as_i64().unwrap_or(WINDOW_WIDTH_EXPANDED as i64) as i32;
                        let height = parsed["height"].as_i64().unwrap_or(WINDOW_HEIGHT_EXPANDED as i64) as i32;
                        window_for_resize.set_default_width(width);
                        window_for_resize.set_default_height(height);

                        // Compositor revokes keyboard focus ~14ms after resize.
                        // Use Exclusive mode briefly when chat opens to grab focus,
                        // then switch back to OnDemand so user can type in other apps.
                        // Use > comparison instead of == to handle scaled chat widths
                        let is_expanding = width > WINDOW_WIDTH_COLLAPSED;
                        debug_log!("[RESIZE] width={}, height={}, is_expanding={}", width, height, is_expanding);
                        let window_clone = window_for_resize.clone();
                        glib::timeout_add_local_once(Duration::from_millis(50), move || {
                            debug_log!("[RESIZE] Setting keyboard mode: {}", if is_expanding { "Exclusive" } else { "OnDemand" });
                            if is_expanding {
                                window_clone.set_keyboard_mode(KeyboardMode::Exclusive);
                            } else {
                                window_clone.set_keyboard_mode(KeyboardMode::OnDemand);
                            }
                        });
                    }
                    _ => {}
                }
            }
        }
    });

    // Create WebView with the content manager (before connecting handlers that need webview)
    let webview = WebView::builder()
        .settings(&settings)
        .user_content_manager(&content_manager)
        .build();

    // Make WebView background transparent (RGBA with 0 alpha)
    webview.set_background_color(&gtk4::gdk::RGBA::new(0.0, 0.0, 0.0, 0.0));

    // Set up moveWindow handler (needs webview for quadrant events)
    let window_for_move = window.clone();
    let webview_for_move = webview.clone();
    let position_for_move = position.clone();
    let drag_state_for_move = drag_state.clone();
    let quadrant_for_move = quadrant.clone();
    content_manager.connect_script_message_received(Some("moveWindow"), move |_manager, js_value| {
        // Convert JS value to JSON string
        if let Some(json_str) = js_value.to_json(0) {
            // Parse the JSON message
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                let action = parsed["action"].as_str().unwrap_or("");

                match action {
                    "startDrag" => {
                        // Save current position as drag start
                        let pos = position_for_move.borrow();
                        let mut drag = drag_state_for_move.borrow_mut();
                        drag.is_dragging = true;
                        drag.start_x = pos.x;
                        drag.start_y = pos.y;
                    }
                    "drag" => {
                        // Fullscreen window approach: no margins, position via CSS
                        let drag = drag_state_for_move.borrow();
                        if !drag.is_dragging {
                            return;
                        }

                        // Get offset from drag start position
                        let offset_x = parsed["offsetX"].as_f64().unwrap_or(0.0) as i32;
                        let offset_y = parsed["offsetY"].as_f64().unwrap_or(0.0) as i32;

                        // Simple position update: start position + offset
                        let new_x = drag.start_x + offset_x;
                        let new_y = drag.start_y + offset_y;

                        // Update stored position
                        {
                            let mut pos = position_for_move.borrow_mut();
                            pos.x = new_x;
                            pos.y = new_y;
                        }

                        // Send position to frontend for CSS update
                        let js = format!(
                            "window.dispatchEvent(new CustomEvent('characterMove', {{ detail: {{ x: {}, y: {} }} }}))",
                            new_x, new_y
                        );
                        webview_for_move.evaluate_javascript(&js, None, None, None::<&gio::Cancellable>, |_| {});
                    }
                    "endDrag" => {
                        {
                            let mut drag = drag_state_for_move.borrow_mut();
                            drag.is_dragging = false;
                        }

                        // Calculate quadrant for chat positioning
                        if let Some((screen_width, screen_height)) = get_screen_dimensions(&window_for_move) {
                            let pos = position_for_move.borrow();

                            // Character center position
                            let char_center_x = pos.x + WINDOW_WIDTH_COLLAPSED / 2;
                            let char_center_y = pos.y + WINDOW_HEIGHT_COLLAPSED / 2;

                            let new_is_right = char_center_x >= screen_width / 2;
                            let new_is_bottom = char_center_y >= screen_height / 2;

                            let prev = quadrant_for_move.borrow();
                            let quadrant_changed = new_is_right != prev.is_right_half
                                || new_is_bottom != prev.is_bottom_half;

                            if quadrant_changed {
                                debug_log!("[ENDDRAG] Quadrant changed: ({},{}) -> ({},{})",
                                    prev.is_right_half, prev.is_bottom_half, new_is_right, new_is_bottom);
                                drop(prev);

                                let new_quadrant = Quadrant {
                                    is_right_half: new_is_right,
                                    is_bottom_half: new_is_bottom,
                                };
                                *quadrant_for_move.borrow_mut() = new_quadrant.clone();

                                // Send quadrant to frontend for chat positioning
                                let js = format!(
                                    "window.dispatchEvent(new CustomEvent('quadrantChange', {{ detail: {{ isRightHalf: {}, isBottomHalf: {} }} }}))",
                                    new_is_right, new_is_bottom
                                );
                                webview_for_move.evaluate_javascript(&js, None, None, None::<&gio::Cancellable>, |_| {});
                            }
                        }
                        debug_log!("[ENDDRAG] Drag finished");
                    }
                    _ => {}
                }
            }
        }
    });

    // Set up executeCommand handler (needs webview reference for callback)
    let webview_for_exec = webview.clone();
    content_manager.connect_script_message_received(Some("executeCommand"), move |_manager, js_value| {
        if let Some(json_str) = js_value.to_json(0) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                let cmd = parsed["cmd"].as_str().unwrap_or("").to_string();
                let callback_id = parsed["callbackId"].as_str().unwrap_or("").to_string();

                if cmd.is_empty() {
                    return;
                }

                info!("Executing command: {}", cmd);

                // Use channel to communicate result back to main thread
                let (tx, rx) = std::sync::mpsc::channel::<String>();

                // Spawn thread for command execution
                std::thread::spawn(move || {
                    let output = std::process::Command::new("sh")
                        .arg("-c")
                        .arg(&cmd)
                        .output();

                    let (stdout, stderr, exit_code) = match output {
                        Ok(out) => (
                            String::from_utf8_lossy(&out.stdout).to_string(),
                            String::from_utf8_lossy(&out.stderr).to_string(),
                            out.status.code().unwrap_or(-1),
                        ),
                        Err(e) => (String::new(), e.to_string(), -1),
                    };

                    info!("Command completed with exit code: {}", exit_code);

                    // Escape strings for JavaScript
                    let stdout_escaped = stdout.replace('\\', "\\\\").replace('`', "\\`").replace("${", "\\${");
                    let stderr_escaped = stderr.replace('\\', "\\\\").replace('`', "\\`").replace("${", "\\${");

                    let js = format!(
                        r#"window.__commandCallbacks && window.__commandCallbacks['{}'] && window.__commandCallbacks['{}']( {{ stdout: `{}`, stderr: `{}`, exit_code: {} }} )"#,
                        callback_id, callback_id, stdout_escaped, stderr_escaped, exit_code
                    );

                    let _ = tx.send(js);
                });

                // Poll for result on main thread
                let webview = webview_for_exec.clone();
                glib::timeout_add_local(Duration::from_millis(10), move || {
                    match rx.try_recv() {
                        Ok(js) => {
                            webview.evaluate_javascript(&js, None, None, None::<&gio::Cancellable>, |_| {});
                            glib::ControlFlow::Break
                        }
                        Err(std::sync::mpsc::TryRecvError::Empty) => glib::ControlFlow::Continue,
                        Err(std::sync::mpsc::TryRecvError::Disconnected) => glib::ControlFlow::Break,
                    }
                });
            }
        }
    });

    // Set up getSystemInfo handler
    let webview_for_sysinfo = webview.clone();
    content_manager.connect_script_message_received(Some("getSystemInfo"), move |_manager, js_value| {
        if let Some(json_str) = js_value.to_json(0) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                let callback_id = parsed["callbackId"].as_str().unwrap_or("").to_string();

                let (tx, rx) = std::sync::mpsc::channel::<String>();

                std::thread::spawn(move || {
                    let os = std::env::consts::OS.to_string();
                    let arch = std::env::consts::ARCH.to_string();
                    let shell = std::env::var("SHELL").ok();

                    // Get distro from /etc/os-release
                    let distro = if os == "linux" {
                        std::process::Command::new("sh")
                            .arg("-c")
                            .arg("cat /etc/os-release 2>/dev/null | grep -E '^NAME=' | head -1 | cut -d= -f2 | tr -d '\"'")
                            .output()
                            .ok()
                            .and_then(|out| {
                                let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
                                if s.is_empty() { None } else { Some(s) }
                            })
                    } else {
                        None
                    };

                    // Detect package manager
                    let package_manager = if os == "linux" {
                        let managers = ["apt", "dnf", "yum", "pacman", "zypper", "apk"];
                        let mut found = None;
                        for mgr in managers {
                            if let Ok(out) = std::process::Command::new("which").arg(mgr).output() {
                                if out.status.success() {
                                    found = Some(mgr.to_string());
                                    break;
                                }
                            }
                        }
                        found
                    } else {
                        None
                    };

                    // Build JSON response
                    let distro_json = distro.map(|d| format!("\"{}\"", d)).unwrap_or("null".to_string());
                    let shell_json = shell.map(|s| format!("\"{}\"", s)).unwrap_or("null".to_string());
                    let pkg_json = package_manager.map(|p| format!("\"{}\"", p)).unwrap_or("null".to_string());

                    let js = format!(
                        r#"window.__commandCallbacks && window.__commandCallbacks['{}'] && window.__commandCallbacks['{}']( {{ os: "{}", arch: "{}", distro: {}, shell: {}, package_manager: {} }} )"#,
                        callback_id, callback_id, os, arch, distro_json, shell_json, pkg_json
                    );

                    let _ = tx.send(js);
                });

                // Poll for result on main thread
                let webview = webview_for_sysinfo.clone();
                glib::timeout_add_local(Duration::from_millis(10), move || {
                    match rx.try_recv() {
                        Ok(js) => {
                            webview.evaluate_javascript(&js, None, None, None::<&gio::Cancellable>, |_| {});
                            glib::ControlFlow::Break
                        }
                        Err(std::sync::mpsc::TryRecvError::Empty) => glib::ControlFlow::Continue,
                        Err(std::sync::mpsc::TryRecvError::Disconnected) => glib::ControlFlow::Break,
                    }
                });
            }
        }
    });

    // Set up debug handler for JS debug logging (only prints when DEBUG_LOGGING is true)
    content_manager.connect_script_message_received(Some("debug"), move |_manager, js_value| {
        if DEBUG_LOGGING {
            if let Some(json_str) = js_value.to_json(0) {
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                    let msg = parsed["message"].as_str().unwrap_or("");
                    println!("[JS] {}", msg);
                }
            }
        }
    });

    // Set up getQuadrant handler - sends initial position and quadrant to frontend
    let window_for_quadrant = window.clone();
    let webview_for_quadrant = webview.clone();
    let position_for_quadrant = position.clone();
    let quadrant_for_get = quadrant.clone();
    content_manager.connect_script_message_received(Some("getQuadrant"), move |_manager, _js_value| {
        if let Some((screen_width, screen_height)) = get_screen_dimensions(&window_for_quadrant) {
            let pos = position_for_quadrant.borrow();

            // Calculate quadrant from absolute position
            let char_center_x = pos.x + WINDOW_WIDTH_COLLAPSED / 2;
            let char_center_y = pos.y + WINDOW_HEIGHT_COLLAPSED / 2;
            let is_right = char_center_x >= screen_width / 2;
            let is_bottom = char_center_y >= screen_height / 2;

            let current_quadrant = Quadrant {
                is_right_half: is_right,
                is_bottom_half: is_bottom,
            };
            *quadrant_for_get.borrow_mut() = current_quadrant.clone();

            // Send initial state to frontend: position + quadrant + screen dimensions
            let js = format!(
                r#"window.dispatchEvent(new CustomEvent('initialState', {{ detail: {{ x: {}, y: {}, isRightHalf: {}, isBottomHalf: {}, screenWidth: {}, screenHeight: {} }} }}))"#,
                pos.x, pos.y, is_right, is_bottom, screen_width, screen_height
            );
            webview_for_quadrant.evaluate_javascript(&js, None, None, None::<&gio::Cancellable>, |_| {});
        }
    });

    // Set up setInputRegion handler for click-through control
    let window_for_input = window.clone();
    content_manager.connect_script_message_received(Some("setInputRegion"), move |_manager, js_value| {
        if let Some(json_str) = js_value.to_json(0) {
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                let mode = parsed["mode"].as_str().unwrap_or("full");

                if let Some(surface) = window_for_input.surface() {
                    match mode {
                        "character" => {
                            // Set input region to only the character area
                            let x = parsed["x"].as_i64().unwrap_or(0) as i32;
                            let y = parsed["y"].as_i64().unwrap_or(0) as i32;
                            let width = parsed["width"].as_i64().unwrap_or(160) as i32;
                            let height = parsed["height"].as_i64().unwrap_or(380) as i32;

                            let region = Region::create_rectangle(&RectangleInt::new(x, y, width, height));
                            surface.set_input_region(&region);
                            debug_log!("[INPUT_REGION] Set to character area: x={}, y={}, w={}, h={}", x, y, width, height);
                        }
                        "full" | _ => {
                            // Clear input region - accept input on entire window
                            // Create a region covering the full window
                            let width = window_for_input.width();
                            let height = window_for_input.height();
                            let region = Region::create_rectangle(&RectangleInt::new(0, 0, width, height));
                            surface.set_input_region(&region);
                            debug_log!("[INPUT_REGION] Set to full window: w={}, h={}", width, height);
                        }
                    }
                }
            }
        }
    });

    webview
}
