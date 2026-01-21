use axum::Router;
use std::net::SocketAddr;
use std::path::PathBuf;
use tower_http::services::ServeDir;
use tracing::info;

/// Find the dist directory containing built frontend assets
pub fn find_dist_dir() -> Option<PathBuf> {
    let mut search_paths: Vec<PathBuf> = vec![
        // Development: relative to project root (when running from desktop-waifu-overlay)
        PathBuf::from("../dist"),
        // Development: when running from project root
        PathBuf::from("dist"),
        // System paths for installed builds
        PathBuf::from("/usr/share/desktop-waifu/dist"),
        PathBuf::from("/usr/local/share/desktop-waifu/dist"),
    ];

    // Same directory as the current executable (bundled)
    if let Some(exe_dist) = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.join("dist")))
    {
        search_paths.insert(2, exe_dist);
    }

    for path in search_paths {
        if path.exists() && path.is_dir() && path.join("index.html").exists() {
            return Some(path);
        }
    }

    None
}

/// Start a static file server on a fixed port for localStorage persistence
/// Returns the port number the server is listening on
pub async fn start_static_server(dist_path: PathBuf) -> Result<u16, String> {
    let serve_dir = ServeDir::new(&dist_path);
    let app = Router::new().fallback_service(serve_dir);

    // Try fixed port 1421 first for localStorage persistence, fallback to random if unavailable
    let preferred_port = 1421;
    let addr = SocketAddr::from(([127, 0, 0, 1], preferred_port));
    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(_) => {
            // Fallback to random port if 1421 is in use
            let fallback_addr = SocketAddr::from(([127, 0, 0, 1], 0));
            tokio::net::TcpListener::bind(fallback_addr)
                .await
                .map_err(|e| format!("Failed to bind server: {}", e))?
        }
    };

    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?
        .port();

    info!("Static file server starting on port {} serving {:?}", port, dist_path);

    // Spawn the server in the background
    tokio::spawn(async move {
        axum::serve(listener, app).await.ok();
    });

    Ok(port)
}

/// Check if the Vite dev server is running on localhost:1420
pub fn is_dev_server_available() -> bool {
    use std::net::TcpStream;
    use std::time::Duration;

    TcpStream::connect_timeout(
        &"127.0.0.1:1420".parse().unwrap(),
        Duration::from_millis(100),
    )
    .is_ok()
}
