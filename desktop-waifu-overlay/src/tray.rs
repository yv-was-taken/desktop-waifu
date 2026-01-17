use ksni::{self, menu::StandardItem, Tray, TrayService};
use std::sync::mpsc;
use tracing::info;

/// Messages sent from tray to main application
#[derive(Debug, Clone)]
pub enum TrayMessage {
    Show,
    Hide,
    Quit,
}

/// System tray implementation using SNI protocol
pub struct DesktopWaifuTray {
    sender: mpsc::Sender<TrayMessage>,
    visible: bool,
}

impl DesktopWaifuTray {
    pub fn new(sender: mpsc::Sender<TrayMessage>) -> Self {
        Self {
            sender,
            visible: true,
        }
    }
}

impl Tray for DesktopWaifuTray {
    fn id(&self) -> String {
        "desktop-waifu".into()
    }

    fn title(&self) -> String {
        "Desktop Waifu".into()
    }

    fn icon_name(&self) -> String {
        // Use a generic icon - can be replaced with custom icon later
        "user-available".into()
    }

    // Left-click on tray icon toggles visibility
    fn activate(&mut self, _x: i32, _y: i32) {
        let msg = if self.visible {
            TrayMessage::Hide
        } else {
            TrayMessage::Show
        };
        let _ = self.sender.send(msg);
        self.visible = !self.visible;
    }

    fn menu(&self) -> Vec<ksni::MenuItem<Self>> {
        use ksni::MenuItem::*;

        let show_hide_label = if self.visible { "Hide" } else { "Show" };
        let show_hide_msg = if self.visible {
            TrayMessage::Hide
        } else {
            TrayMessage::Show
        };

        vec![
            StandardItem {
                label: show_hide_label.into(),
                activate: Box::new(move |tray: &mut Self| {
                    let _ = tray.sender.send(show_hide_msg.clone());
                    tray.visible = !tray.visible;
                }),
                ..Default::default()
            }
            .into(),
            Separator,
            StandardItem {
                label: "Quit".into(),
                activate: Box::new(|tray: &mut Self| {
                    let _ = tray.sender.send(TrayMessage::Quit);
                }),
                ..Default::default()
            }
            .into(),
        ]
    }
}

/// Spawn the system tray in a separate thread
/// Returns a receiver for tray messages and a handle to update tray state
pub fn spawn_tray() -> anyhow::Result<(mpsc::Receiver<TrayMessage>, ksni::Handle<DesktopWaifuTray>)> {
    let (sender, receiver) = mpsc::channel();

    let tray = DesktopWaifuTray::new(sender);
    let service = TrayService::new(tray);
    let handle = service.handle();

    // Spawn tray service in a separate thread
    std::thread::spawn(move || {
        info!("Starting system tray service");
        if let Err(e) = service.run() {
            tracing::error!("System tray service error: {}", e);
        }
    });

    info!("System tray spawned");
    Ok((receiver, handle))
}

/// Update tray visibility state (call when window is shown/hidden from other sources)
pub fn update_tray_visibility(handle: &ksni::Handle<DesktopWaifuTray>, visible: bool) {
    handle.update(move |tray| {
        tray.visible = visible;
    });
}
