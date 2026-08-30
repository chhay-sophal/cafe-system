// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::{Manager, Position, WebviewUrl, WebviewWindowBuilder};

            let main_window = app
                .get_webview_window("main")
                .ok_or("missing main window")?;

            let monitors = main_window.available_monitors()?;
            let main_monitor = main_window.current_monitor()?;

            // Pick any monitor that isn't the one the cashier window is
            // currently on - a genuine second screen facing the customer.
            // Single-monitor setups: no match, no customer window, and the
            // cashier screen behaves exactly as before.
            let customer_monitor = monitors.iter().find(|monitor| {
                main_monitor
                    .as_ref()
                    .map(|main| monitor.position() != main.position())
                    .unwrap_or(true)
            });

            if let Some(monitor) = customer_monitor {
                let position = *monitor.position();
                // Built hidden, positioned, then fullscreened before showing -
                // avoids a visible jump from the default spawn position to
                // the target monitor.
                let customer_window = WebviewWindowBuilder::new(
                    app,
                    "customer-display",
                    WebviewUrl::App("index.html".into()),
                )
                .title("Customer Display")
                .resizable(false)
                .visible(false)
                .build()?;

                customer_window.set_position(Position::Physical(position))?;
                customer_window.set_fullscreen(true)?;
                customer_window.show()?;
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
