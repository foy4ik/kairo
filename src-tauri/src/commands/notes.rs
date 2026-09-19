use crate::db::models::*;
use crate::db::{notes, Db};
use crate::error::AppResult;
use tauri::State;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_notes(db: State<'_, Db>, project_id: Option<i64>, limit: Option<i64>) -> AppResult<Vec<Note>> {
    db.with(|c| notes::list_notes(c, project_id, limit))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_note(db: State<'_, Db>, id: i64) -> AppResult<Note> {
    db.with(|c| notes::get_note(c, id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn create_note(db: State<'_, Db>, input: NoteInput) -> AppResult<Note> {
    db.with(|c| notes::create_note(c, input))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn save_note(db: State<'_, Db>, id: i64, input: NoteInput) -> AppResult<Note> {
    db.with(|c| notes::save_note(c, id, input))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn delete_note(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| notes::delete_note(c, id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn search_notes(db: State<'_, Db>, query: String) -> AppResult<Vec<Note>> {
    db.with(|c| notes::search_notes(c, &query))
}
