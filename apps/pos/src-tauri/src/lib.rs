mod printer;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
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
            // cashier screen behaves exactly as before. If the cashier's
            // monitor can't be determined, skip the customer window rather
            // than risk opening it fullscreen over the cashier screen.
            let customer_monitor = main_monitor.as_ref().and_then(|main| {
                monitors
                    .iter()
                    .find(|monitor| monitor.position() != main.position())
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
        // Tauri only exits once every window is closed, so closing the
        // cashier window alone would leave the customer display up (and the
        // app running) with nothing driving it. The cashier window is the
        // app: closing it quits everything. Closing just the customer
        // display (e.g. Alt+F4 on that screen) leaves the register running.
        .on_window_event(|window, event| {
            use tauri::Manager;

            if window.label() == "main" {
                if let tauri::WindowEvent::Destroyed = event {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            printer::list_printers,
            printer::print_raw
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
