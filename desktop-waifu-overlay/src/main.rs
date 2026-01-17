mod ipc;

use anyhow::Result;
use gtk4::glib;
use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow};
use gtk4_layer_shell::{Edge, KeyboardMode, Layer, LayerShell as _};
use std::cell::RefCell;
use std::rc::Rc;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;
use webkit6::prelude::*;
use webkit6::{Settings as WebViewSettings, UserContentManager, WebView};

const APP_ID: &str = "com.desktop-waifu.overlay";

// Store window position (margins from edges)
#[derive(Clone, Debug, Default)]
struct WindowPosition {
    bottom: i32,
    right: i32,
}

// Store drag state
#[derive(Clone, Debug, Default)]
struct DragState {
    start_margins: WindowPosition,
    is_dragging: bool,
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
    // Create the main window (wide enough for character + chat panel side by side)
    let window = ApplicationWindow::builder()
        .application(app)
        .title("Desktop Waifu Overlay")
        .default_width(740)
        .default_height(600)
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
    let position = Rc::new(RefCell::new(WindowPosition {
        bottom: 20,
        right: 20,
    }));

    // Drag state
    let drag_state = Rc::new(RefCell::new(DragState::default()));

    // Set initial margins
    window.set_margin(Edge::Bottom, position.borrow().bottom);
    window.set_margin(Edge::Right, position.borrow().right);

    // Don't reserve exclusive space
    window.set_exclusive_zone(-1);

    // Allow keyboard focus when user clicks on the overlay (for text input)
    window.set_keyboard_mode(KeyboardMode::OnDemand);

    // Set namespace for compositor identification
    window.set_namespace(Some("desktop-waifu"));

    info!("Layer shell configured: OVERLAY layer, bottom-right anchor");

    // Create WebView with message handler for drag events
    let webview = create_webview_with_drag_handler(&window, position, drag_state);

    // Add WebView to window
    window.set_child(Some(&webview));

    // Load from Vite dev server - add ?overlay=true to enable overlay mode
    let dev_url = "http://localhost:1420?overlay=true";
    webview.load_uri(dev_url);
    info!("Loading WebView from: {}", dev_url);

    // Show the window
    window.present();

    info!("Overlay window created and presented");
}

fn create_webview_with_drag_handler(
    window: &ApplicationWindow,
    position: Rc<RefCell<WindowPosition>>,
    drag_state: Rc<RefCell<DragState>>,
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

    // Clone window for the closure
    let window_clone = window.clone();

    // Connect to the script-message-received signal
    // The callback receives (manager, js_value)
    content_manager.connect_script_message_received(Some("moveWindow"), move |_manager, js_value| {
        // Convert JS value to JSON string
        if let Some(json_str) = js_value.to_json(0) {
            // Parse the JSON message
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(json_str.as_str()) {
                let action = parsed["action"].as_str().unwrap_or("");

                match action {
                    "startDrag" => {
                        // Save current position as drag start
                        let pos = position.borrow();
                        let mut drag = drag_state.borrow_mut();
                        drag.is_dragging = true;
                        drag.start_margins = WindowPosition {
                            bottom: pos.bottom,
                            right: pos.right,
                        };
                        info!("Drag started at margins: right={}, bottom={}", pos.right, pos.bottom);
                    }
                    "drag" => {
                        let drag = drag_state.borrow();
                        if !drag.is_dragging {
                            return;
                        }

                        // Get offset from drag start position
                        let offset_x = parsed["offsetX"].as_f64().unwrap_or(0.0) as i32;
                        let offset_y = parsed["offsetY"].as_f64().unwrap_or(0.0) as i32;

                        // Calculate new position from start margins + offset
                        // Moving right (positive offsetX) = decrease right margin
                        // Moving down (positive offsetY) = decrease bottom margin
                        let new_right = (drag.start_margins.right - offset_x).max(0);
                        let new_bottom = (drag.start_margins.bottom - offset_y).max(0);

                        // Update position
                        {
                            let mut pos = position.borrow_mut();
                            pos.right = new_right;
                            pos.bottom = new_bottom;
                        }

                        // Apply new margins
                        window_clone.set_margin(Edge::Right, new_right);
                        window_clone.set_margin(Edge::Bottom, new_bottom);
                    }
                    "endDrag" => {
                        let mut drag = drag_state.borrow_mut();
                        drag.is_dragging = false;
                        let pos = position.borrow();
                        info!("Drag ended at margins: right={}, bottom={}", pos.right, pos.bottom);
                    }
                    _ => {}
                }
            }
        }
    });

    // Create WebView with the content manager
    let webview = WebView::builder()
        .settings(&settings)
        .user_content_manager(&content_manager)
        .build();

    // Make WebView background transparent (RGBA with 0 alpha)
    webview.set_background_color(&gtk4::gdk::RGBA::new(0.0, 0.0, 0.0, 0.0));

    info!("WebView created with drag handler and transparent background");

    webview
}
