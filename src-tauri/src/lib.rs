mod database;
mod settings;
mod reddit;
mod topics;
mod commands;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle().clone();
            database::init_database(&app_handle)?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Settings commands
            commands::get_settings,
            commands::save_settings,
            commands::test_reddit_connection,
            // Collection commands
            commands::run_collection,
            commands::get_collection_status,
            // Topics commands
            commands::get_topics,
            commands::get_topic_details,
            commands::search_topics,
            // Content commands
            commands::get_content,
            commands::get_content_by_topic,
            // Dashboard commands
            commands::get_dashboard_stats,
            // Alerts commands
            commands::get_alerts,
            commands::mark_alert_read,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
