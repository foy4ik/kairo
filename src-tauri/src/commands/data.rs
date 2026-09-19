use crate::db::backup::{self, BackupSummary};
use crate::db::{demo, Db};
use crate::error::{AppError, AppResult};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[tauri::command(rename_all = "snake_case")]
pub async fn export_data(db: State<'_, Db>, path: String) -> AppResult<()> {
    db.with(|c| backup::export_to_file(c, &PathBuf::from(path)))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn backup_database(db: State<'_, Db>, path: String) -> AppResult<()> {
    db.with(|c| backup::backup_database(c, &PathBuf::from(path)))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn validate_backup(path: String) -> AppResult<BackupSummary> {
    backup::validate_file(&PathBuf::from(path))
}

/// Replaces all data with the backup. The current data is saved to `<app data>/backups` first.
#[tauri::command(rename_all = "snake_case")]
pub async fn import_data(app: AppHandle, db: State<'_, Db>, path: String) -> AppResult<BackupSummary> {
    let dir = app.path().app_data_dir().ok().map(|d| d.join("backups"));
    let summary = db.with(|c| backup::import_file(c, &PathBuf::from(path), dir.as_deref()))?;
    Ok(summary)
}

#[tauri::command(rename_all = "snake_case")]
pub async fn reset_data(db: State<'_, Db>) -> AppResult<()> {
    db.with(|c| backup::reset_all(c))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn load_demo_data(db: State<'_, Db>, lang: String) -> AppResult<()> {
    db.with(|c| demo::load_demo(c, &lang))
}

#[derive(serde::Serialize)]
pub struct AppInfo {
    pub version: &'static str,
    pub data_dir: String,
    pub db_path: String,
    pub schema_version: usize,
}

#[tauri::command(rename_all = "snake_case")]
pub async fn get_app_info(app: AppHandle) -> AppResult<AppInfo> {
    let dir = app.path().app_data_dir().map_err(|e| AppError::new("IO", e.to_string()))?;
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION"),
        db_path: dir.join("kairo.db").to_string_lossy().into_owned(),
        data_dir: dir.to_string_lossy().into_owned(),
        schema_version: crate::db::schema_version(),
    })
}
