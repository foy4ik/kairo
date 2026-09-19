use crate::db::analytics::{self, Analytics};
use crate::db::models::FocusSession;
use crate::db::{sessions, Db};
use crate::error::AppResult;
use tauri::State;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_analytics(db: State<'_, Db>, from: String, to: String, tz_offset_min: i64) -> AppResult<Analytics> {
    db.with(|c| analytics::get_analytics(c, &from, &to, tz_offset_min))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_focus_sessions(
    db: State<'_, Db>,
    project_id: Option<i64>,
    task_id: Option<i64>,
    limit: Option<i64>,
) -> AppResult<Vec<FocusSession>> {
    db.with(|c| sessions::list_sessions(c, project_id, task_id, limit))
}
