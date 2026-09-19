#[cfg(feature = "desktop")]
pub mod commands;
pub mod db;
pub mod error;
pub mod services;

#[cfg(feature = "desktop")]
pub use shell::run;

#[cfg(feature = "desktop")]
mod shell {
use crate::commands::{analytics, data, files, notes, projects, settings, tasks, timer};
use crate::db::{self, Db};
use crate::services::{runtime, tray};
use tauri::{Manager, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(runtime::AppTimer::new())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            let db = Db::open(&dir.join("kairo.db"))
                .map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
            let lang = {
                let conn = db.lock().map_err(|e| -> Box<dyn std::error::Error> { e.to_string().into() })?;
                db::settings::get_settings(&conn)
                    .ok()
                    .and_then(|s| s.get("language").and_then(|v| v.as_str().map(String::from)))
                    .unwrap_or_else(|| "ru".into())
            };
            app.manage(db);
            tray::setup(app.handle(), &lang)?;
            runtime::spawn_ticker(app.handle().clone());
            // The window starts hidden and the UI shows it after its first frame (no white flash).
            // This watchdog guarantees the window appears even if the frontend fails to start.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(5));
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the window while a session is running keeps the timer alive in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                if runtime::is_active(window.app_handle()) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            projects::get_projects,
            projects::get_project,
            projects::create_project,
            projects::update_project,
            projects::archive_project,
            projects::delete_project,
            projects::get_columns,
            projects::create_column,
            projects::update_column,
            projects::delete_column,
            projects::reorder_columns,
            tasks::get_tasks,
            tasks::get_task,
            tasks::create_task,
            tasks::update_task,
            tasks::move_task,
            tasks::delete_task,
            tasks::add_subtask,
            tasks::update_subtask,
            tasks::delete_subtask,
            tasks::get_tags,
            tasks::global_search,
            notes::get_notes,
            notes::get_note,
            notes::create_note,
            notes::save_note,
            notes::delete_note,
            notes::search_notes,
            files::get_file_references,
            files::add_file_reference,
            files::remove_file_reference,
            files::open_file,
            files::reveal_in_folder,
            files::open_external,
            timer::get_timer_state,
            timer::start_timer,
            timer::pause_timer,
            timer::resume_timer,
            timer::stop_timer,
            timer::complete_session,
            analytics::get_analytics,
            analytics::get_focus_sessions,
            data::export_data,
            data::backup_database,
            data::validate_backup,
            data::import_data,
            data::reset_data,
            data::load_demo_data,
            data::get_app_info,
            settings::get_settings,
            settings::update_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Kairo");
}
}
