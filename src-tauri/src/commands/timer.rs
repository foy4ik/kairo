use crate::error::AppResult;
use crate::services::runtime;
use crate::services::timer::TimerState;
use tauri::AppHandle;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_timer_state(app: AppHandle) -> AppResult<TimerState> {
    runtime::snapshot(&app)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn start_timer(
    app: AppHandle,
    kind: Option<String>,
    task_id: Option<i64>,
    duration_sec: Option<i64>,
    long_break_every: Option<i64>,
) -> AppResult<TimerState> {
    runtime::start(&app, kind, task_id, duration_sec, long_break_every)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn pause_timer(app: AppHandle) -> AppResult<TimerState> {
    runtime::pause(&app)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn resume_timer(app: AppHandle) -> AppResult<TimerState> {
    runtime::resume(&app)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn stop_timer(app: AppHandle) -> AppResult<TimerState> {
    runtime::stop(&app)
}

/// Acknowledges a naturally completed session (its record is written by the backend ticker).
#[tauri::command(rename_all = "snake_case")]
pub async fn complete_session(app: AppHandle) -> AppResult<TimerState> {
    runtime::dismiss(&app)
}
