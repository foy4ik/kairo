use crate::db::models::*;
use crate::db::{search, tasks, Db};
use crate::error::AppResult;
use tauri::State;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_tasks(db: State<'_, Db>, project_id: Option<i64>) -> AppResult<Vec<Task>> {
    db.with(|c| tasks::list_tasks(c, project_id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_task(db: State<'_, Db>, id: i64) -> AppResult<Task> {
    db.with(|c| tasks::get_task(c, id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_task(db: State<'_, Db>, input: NewTask) -> AppResult<Task> {
    db.with(|c| tasks::create_task(c, input))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_task(db: State<'_, Db>, id: i64, patch: TaskPatch) -> AppResult<Task> {
    db.with(|c| tasks::update_task(c, id, patch))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn move_task(db: State<'_, Db>, id: i64, column_id: i64, position: i64) -> AppResult<Task> {
    db.with(|c| tasks::move_task(c, id, column_id, position))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_task(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| tasks::delete_task(c, id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn add_subtask(db: State<'_, Db>, task_id: i64, title: String) -> AppResult<Task> {
    db.with(|c| tasks::add_subtask(c, task_id, &title))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_subtask(db: State<'_, Db>, id: i64, patch: SubtaskPatch) -> AppResult<Task> {
    db.with(|c| tasks::update_subtask(c, id, patch))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_subtask(db: State<'_, Db>, id: i64) -> AppResult<Task> {
    db.with(|c| tasks::delete_subtask(c, id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_tags(db: State<'_, Db>) -> AppResult<Vec<Tag>> {
    db.with(|c| tasks::list_tags(c))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn global_search(db: State<'_, Db>, query: String) -> AppResult<SearchResults> {
    db.with(|c| search::global_search(c, &query))
}
