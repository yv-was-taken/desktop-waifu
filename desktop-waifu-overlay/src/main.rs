mod ipc;

use anyhow::Result;
use gtk4::glib;
use gtk4::prelude::*;
use gtk4::{Application, ApplicationWindow};
use gtk4_layer_shell::{Edge, KeyboardMode, Layer, LayerShell as _};
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;
use webkit6::prelude::*;
use webkit6::{WebView, Settings as WebViewSettings};

const APP_ID: &str = "com.desktop-waifu.overlay";

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
        "window, window.background { background-color: transparent; }"
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

    // Set margins from screen edge
    window.set_margin(Edge::Bottom, 20);
    window.set_margin(Edge::Right, 20);

    // Don't reserve exclusive space
    window.set_exclusive_zone(-1);

    // Allow keyboard focus when user clicks on the overlay (for text input)
    window.set_keyboard_mode(KeyboardMode::OnDemand);

    // Set namespace for compositor identification
    window.set_namespace(Some("desktop-waifu"));

    info!("Layer shell configured: OVERLAY layer, bottom-right anchor");

    // Create WebView with settings
    let webview = create_webview();

    // Add WebView to window
    window.set_child(Some(&webview));

    // Make window click-through by setting input region
    // Note: This needs to be done after the window is realized
    window.connect_realize(|window| {
        make_click_through(window);
    });

    // Load from Vite dev server - add ?overlay=true to enable overlay mode
    let dev_url = "http://localhost:1420?overlay=true";
    webview.load_uri(dev_url);
    info!("Loading WebView from: {}", dev_url);

    // Show the window
    window.present();

    info!("Overlay window created and presented");
}

fn create_webview() -> WebView {
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

    // Keep hardware acceleration for WebGL (Three.js needs it)
    // settings.set_hardware_acceleration_policy(webkit6::HardwareAccelerationPolicy::Always);

    // Create WebView with settings
    let webview = WebView::builder()
        .settings(&settings)
        .build();

    // Make WebView background transparent (RGBA with 0 alpha)
    webview.set_background_color(&gtk4::gdk::RGBA::new(0.0, 0.0, 0.0, 0.0));

    info!("WebView created with transparent background and WebGL enabled");

    webview
}

fn make_click_through(window: &ApplicationWindow) {
    // Get the GDK surface
    if let Some(surface) = window.surface() {
        // Create an empty input region to make the window click-through
        // Unfortunately, GTK4 doesn't directly expose input region setting
        // We need to use the underlying Wayland surface

        // For now, we'll skip click-through and handle it via compositor hints
        // or by setting the window as non-interactive via layer-shell

        info!("Window realized - click-through would be set here");

        // Alternative approach: Use CSS to make the window visually transparent
        // but this doesn't actually make it click-through
    }
}
