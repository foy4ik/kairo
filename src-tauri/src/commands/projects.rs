use crate::db::models::*;
use crate::db::{projects, Db};
use crate::error::AppResult;
use tauri::State;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_projects(db: State<'_, Db>) -> AppResult<Vec<ProjectSummary>> {
    db.with(|c| projects::list_projects(c))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_project(db: State<'_, Db>, id: i64) -> AppResult<Project> {
    db.with(|c| projects::get_project(c, id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_project(db: State<'_, Db>, input: NewProject) -> AppResult<Project> {
    db.with(|c| projects::create_project(c, input))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_project(db: State<'_, Db>, id: i64, patch: ProjectPatch) -> AppResult<Project> {
    db.with(|c| projects::update_project(c, id, patch))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn archive_project(db: State<'_, Db>, id: i64) -> AppResult<Project> {
    db.with(|c| projects::archive_project(c, id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_project(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| projects::delete_project(c, id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_columns(db: State<'_, Db>, project_id: i64) -> AppResult<Vec<Column>> {
    db.with(|c| projects::list_columns(c, project_id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_column(db: State<'_, Db>, project_id: i64, name: String) -> AppResult<Column> {
    db.with(|c| projects::create_column(c, project_id, &name))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_column(
    db: State<'_, Db>,
    id: i64,
    name: Option<String>,
    is_done: Option<bool>,
) -> AppResult<Column> {
    db.with(|c| projects::update_column(c, id, name, is_done))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_column(db: State<'_, Db>, id: i64, move_to: Option<i64>) -> AppResult<()> {
    db.with(|c| projects::delete_column(c, id, move_to))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn reorder_columns(db: State<'_, Db>, project_id: i64, ordered_ids: Vec<i64>) -> AppResult<Vec<Column>> {
    db.with(|c| projects::reorder_columns(c, project_id, &ordered_ids))
}
