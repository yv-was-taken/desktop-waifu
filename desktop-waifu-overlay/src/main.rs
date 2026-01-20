mod ipc;
mod tray;

// Debug logging flag - set to true to enable debug output to terminal
const DEBUG_LOGGING: bool = false;

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

// Store window position (margins from anchored edges)
#[derive(Clone, Debug)]
struct WindowPosition {
    // Vertical margin from anchored edge (bottom or top)
    vertical: i32,
    // Horizontal margin from anchored edge (right or left)
    horizontal: i32,
    // Which edges we're anchored to
    anchor_right: bool,
    anchor_bottom: bool,
}

impl Default for WindowPosition {
    fn default() -> Self {
        Self {
            vertical: 20,
            horizontal: 20,
            anchor_right: true,
            anchor_bottom: true,
        }
    }
}

// Screen quadrant information
#[derive(Clone, Debug, Default)]
struct Quadrant {
    is_right_half: bool,
    is_bottom_half: bool,
}

// Hysteresis buffer to prevent flickering at boundaries (in pixels)
const QUADRANT_HYSTERESIS: i32 = 50;

// Store drag state
#[derive(Clone, Debug, Default)]
struct DragState {
    start_horizontal: i32,
    start_vertical: i32,
    is_dragging: bool,
}

/// Update layer-shell anchoring based on quadrant
fn update_anchoring(window: &ApplicationWindow, position: &mut WindowPosition, new_anchor_right: bool, new_anchor_bottom: bool, screen_width: i32, screen_height: i32, window_width: i32, window_height: i32) {
    // Convert horizontal margin if anchor side changed
    if position.anchor_right != new_anchor_right {
        // Window edge position stays the same, but margin is measured from opposite edge
        // old_edge_pos = screen_size - old_margin - window_size (if anchored to right)
        // old_edge_pos = old_margin (if anchored to left)
        // new_margin = screen_size - old_edge_pos - window_size (if switching to right)
        // new_margin = old_edge_pos (if switching to left)

        if position.anchor_right {
            // Was anchored right, switching to left
            // Window's left edge = screen_width - horizontal - window_width
            let left_edge = screen_width - position.horizontal - window_width;
            position.horizontal = left_edge.max(0);
        } else {
            // Was anchored left, switching to right
            // Window's right edge = horizontal + window_width
            // New right margin = screen_width - right_edge = screen_width - horizontal - window_width
            let right_margin = screen_width - position.horizontal - window_width;
            position.horizontal = right_margin.max(0);
        }
        position.anchor_right = new_anchor_right;

        // Update layer-shell anchoring
        window.set_anchor(Edge::Right, new_anchor_right);
        window.set_anchor(Edge::Left, !new_anchor_right);
    }

    // Convert vertical margin if anchor side changed
    if position.anchor_bottom != new_anchor_bottom {
        if position.anchor_bottom {
            // Was anchored bottom, switching to top
            let top_edge = screen_height - position.vertical - window_height;
            position.vertical = top_edge.max(0);
        } else {
            // Was anchored top, switching to bottom
            let bottom_margin = screen_height - position.vertical - window_height;
            position.vertical = bottom_margin.max(0);
        }
        position.anchor_bottom = new_anchor_bottom;

        // Update layer-shell anchoring
        window.set_anchor(Edge::Bottom, new_anchor_bottom);
        window.set_anchor(Edge::Top, !new_anchor_bottom);
    }

    // Apply the new margins
    if position.anchor_right {
        window.set_margin(Edge::Right, position.horizontal);
        window.set_margin(Edge::Left, 0);
    } else {
        window.set_margin(Edge::Left, position.horizontal);
        window.set_margin(Edge::Right, 0);
    }

    if position.anchor_bottom {
        window.set_margin(Edge::Bottom, position.vertical);
        window.set_margin(Edge::Top, 0);
    } else {
        window.set_margin(Edge::Top, position.vertical);
        window.set_margin(Edge::Bottom, 0);
    }
}

/// Get screen dimensions from the monitor containing the window
fn get_screen_dimensions(window: &ApplicationWindow) -> Option<(i32, i32)> {
    let display = gtk4::gdk::Display::default()?;
    let surface = window.surface()?;
    let monitor = display.monitor_at_surface(&surface)?;
    let geometry = monitor.geometry();
    Some((geometry.width(), geometry.height()))
}

/// Calculate quadrant based on window position (center of window)
/// Uses hysteresis to prevent flickering at boundaries
fn calculate_quadrant(
    position: &WindowPosition,
    window_width: i32,
    window_height: i32,
    screen_width: i32,
    screen_height: i32,
    prev_quadrant: &Quadrant,
) -> Quadrant {
    // Calculate window center position based on current anchoring
    let window_center_x = if position.anchor_right {
        // Anchored to right: margin is from right edge
        screen_width - position.horizontal - window_width / 2
    } else {
        // Anchored to left: margin is from left edge
        position.horizontal + window_width / 2
    };

    let window_center_y = if position.anchor_bottom {
        // Anchored to bottom: margin is from bottom edge
        screen_height - position.vertical - window_height / 2
    } else {
        // Anchored to top: margin is from top edge
        position.vertical + window_height / 2
    };

    let screen_center_x = screen_width / 2;
    let screen_center_y = screen_height / 2;

    // Apply hysteresis: only change quadrant if we've crossed threshold beyond midpoint
    let is_right_half = if prev_quadrant.is_right_half {
        // Currently in right half, need to cross left of center - hysteresis to switch
        window_center_x > screen_center_x - QUADRANT_HYSTERESIS
    } else {
        // Currently in left half, need to cross right of center + hysteresis to switch
        window_center_x > screen_center_x + QUADRANT_HYSTERESIS
    };

    let is_bottom_half = if prev_quadrant.is_bottom_half {
        // Currently in bottom half, need to cross above center - hysteresis to switch
        window_center_y > screen_center_y - QUADRANT_HYSTERESIS
    } else {
        // Currently in top half, need to cross below center + hysteresis to switch
        window_center_y > screen_center_y + QUADRANT_HYSTERESIS
    };

    Quadrant { is_right_half, is_bottom_half }
}

/// Send quadrant change event to frontend via WebView
fn send_quadrant_to_frontend(webview: &WebView, quadrant: &Quadrant) {
    let js = format!(
        r#"window.dispatchEvent(new CustomEvent('quadrantChange', {{ detail: {{ isRightHalf: {}, isBottomHalf: {} }} }}))"#,
        quadrant.is_right_half, quadrant.is_bottom_half
    );
    webview.evaluate_javascript(&js, None, None, None::<&gio::Cancellable>, |_| {});
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

    // Anchor to bottom-right corner
    window.set_anchor(Edge::Bottom, true);
    window.set_anchor(Edge::Right, true);

    // Initial position (margins from screen edge)
    let position = Rc::new(RefCell::new(WindowPosition::default()));

    // Drag state
    let drag_state = Rc::new(RefCell::new(DragState::default()));

    // Quadrant state (initially bottom-right)
    let quadrant = Rc::new(RefCell::new(Quadrant {
        is_right_half: true,
        is_bottom_half: true,
    }));

    // Set initial margins
    window.set_margin(Edge::Bottom, position.borrow().vertical);
    window.set_margin(Edge::Right, position.borrow().horizontal);

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
    position: Rc<RefCell<WindowPosition>>,
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
                        drag.start_horizontal = pos.horizontal;
                        drag.start_vertical = pos.vertical;
                    }
                    "drag" => {
                        let drag = drag_state_for_move.borrow();
                        if !drag.is_dragging {
                            return;
                        }

                        // Get offset from drag start position
                        let offset_x = parsed["offsetX"].as_f64().unwrap_or(0.0) as i32;
                        let offset_y = parsed["offsetY"].as_f64().unwrap_or(0.0) as i32;

                        let pos = position_for_move.borrow();
                        let anchor_right = pos.anchor_right;
                        let anchor_bottom = pos.anchor_bottom;
                        drop(pos);

                        // Calculate new margins based on anchor direction
                        // Moving right (positive offsetX): decrease margin if anchored right, increase if anchored left
                        // Moving down (positive offsetY): decrease margin if anchored bottom, increase if anchored top
                        let new_horizontal = if anchor_right {
                            (drag.start_horizontal - offset_x).max(0)
                        } else {
                            (drag.start_horizontal + offset_x).max(0)
                        };

                        let new_vertical = if anchor_bottom {
                            (drag.start_vertical - offset_y).max(0)
                        } else {
                            (drag.start_vertical + offset_y).max(0)
                        };

                        // Update position
                        {
                            let mut pos = position_for_move.borrow_mut();
                            pos.horizontal = new_horizontal;
                            pos.vertical = new_vertical;
                        }

                        // Apply new margins to the appropriate edges
                        if anchor_right {
                            window_for_move.set_margin(Edge::Right, new_horizontal);
                        } else {
                            window_for_move.set_margin(Edge::Left, new_horizontal);
                        }

                        if anchor_bottom {
                            window_for_move.set_margin(Edge::Bottom, new_vertical);
                        } else {
                            window_for_move.set_margin(Edge::Top, new_vertical);
                        }
                    }
                    "endDrag" => {
                        {
                            let mut drag = drag_state_for_move.borrow_mut();
                            drag.is_dragging = false;
                        }

                        // Calculate and update quadrant/anchoring on drag end
                        if let Some((screen_width, screen_height)) = get_screen_dimensions(&window_for_move) {
                            let window_width = window_for_move.width();
                            let window_height = window_for_move.height();

                            let new_quadrant = {
                                let pos = position_for_move.borrow();
                                calculate_quadrant(
                                    &pos,
                                    window_width,
                                    window_height,
                                    screen_width,
                                    screen_height,
                                    &quadrant_for_move.borrow(),
                                )
                            };

                            // Check if quadrant changed
                            let prev = quadrant_for_move.borrow().clone();
                            let quadrant_changed = new_quadrant.is_right_half != prev.is_right_half
                                || new_quadrant.is_bottom_half != prev.is_bottom_half;

                            if quadrant_changed {
                                // Update anchoring based on new quadrant
                                {
                                    let mut pos = position_for_move.borrow_mut();
                                    update_anchoring(
                                        &window_for_move,
                                        &mut pos,
                                        new_quadrant.is_right_half,
                                        new_quadrant.is_bottom_half,
                                        screen_width,
                                        screen_height,
                                        window_width,
                                        window_height,
                                    );
                                }

                                *quadrant_for_move.borrow_mut() = new_quadrant.clone();
                                send_quadrant_to_frontend(&webview_for_move, &new_quadrant);
                            }
                        }
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

    // Set up getQuadrant handler for initial quadrant state request from frontend
    let window_for_quadrant = window.clone();
    let webview_for_quadrant = webview.clone();
    let position_for_quadrant = position.clone();
    let quadrant_for_get = quadrant.clone();
    content_manager.connect_script_message_received(Some("getQuadrant"), move |_manager, _js_value| {
        // Calculate current quadrant based on window position
        if let Some((screen_width, screen_height)) = get_screen_dimensions(&window_for_quadrant) {
            let pos = position_for_quadrant.borrow();
            let window_width = window_for_quadrant.width();
            let window_height = window_for_quadrant.height();

            let current_quadrant = calculate_quadrant(
                &pos,
                window_width,
                window_height,
                screen_width,
                screen_height,
                &quadrant_for_get.borrow(),
            );

            // Update stored quadrant
            *quadrant_for_get.borrow_mut() = current_quadrant.clone();

            // Send to frontend
            send_quadrant_to_frontend(&webview_for_quadrant, &current_quadrant);
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
