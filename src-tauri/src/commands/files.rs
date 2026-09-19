use crate::db::models::FileReference;
use crate::db::{files, Db};
use crate::error::{AppError, AppResult};
use std::path::Path;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command(rename_all = "snake_case")]
pub async fn get_file_references(db: State<'_, Db>, project_id: i64) -> AppResult<Vec<FileReference>> {
    db.with(|c| files::list_file_references(c, project_id))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn add_file_reference(
    db: State<'_, Db>,
    project_id: i64,
    path: String,
    label: Option<String>,
) -> AppResult<FileReference> {
    db.with(|c| files::add_file_reference(c, project_id, &path, label))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn remove_file_reference(db: State<'_, Db>, id: i64) -> AppResult<()> {
    db.with(|c| files::remove_file_reference(c, id))
}

fn ensure_exists(path: &str) -> AppResult<()> {
    if Path::new(path).exists() {
        Ok(())
    } else {
        Err(AppError::new("FILE_NOT_FOUND", format!("{path} was moved or deleted")))
    }
}

#[tauri::command(rename_all = "snake_case")]
pub async fn open_file(app: AppHandle, path: String) -> AppResult<()> {
    ensure_exists(&path)?;
    app.opener().open_path(path, None::<&str>).map_err(|e| AppError::new("OPEN_FAILED", e.to_string()))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn reveal_in_folder(app: AppHandle, path: String) -> AppResult<()> {
    ensure_exists(&path)?;
    app.opener().reveal_item_in_dir(path).map_err(|e| AppError::new("OPEN_FAILED", e.to_string()))
}

/// Opens a link from rendered Markdown in the system browser. Only safe schemes are allowed.
#[tauri::command(rename_all = "snake_case")]
pub async fn open_external(app: AppHandle, url: String) -> AppResult<()> {
    let lower = url.trim().to_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")) {
        return Err(AppError::validation("Only http, https and mailto links can be opened"));
    }
    app.opener().open_url(url.trim(), None::<&str>).map_err(|e| AppError::new("OPEN_FAILED", e.to_string()))
}
