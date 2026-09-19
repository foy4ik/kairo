use crate::db::{settings, Db};
use crate::error::AppResult;
use crate::services::tray;
use serde_json::Value;
use tauri::{AppHandle, State};

#[tauri::command(rename_all = "snake_case")]
pub async fn get_settings(db: State<'_, Db>) -> AppResult<Value> {
    db.with(|c| settings::get_settings(c))
}

#[tauri::command(rename_all = "snake_case")]
pub async fn update_setting(app: AppHandle, db: State<'_, Db>, key: String, value: Value) -> AppResult<Value> {
    let all = db.with(|c| settings::update_setting(c, &key, value))?;
    if key == "language" {
        if let Some(lang) = all.get("language").and_then(Value::as_str) {
            tray::set_language(&app, lang);
        }
    }
    Ok(all)
}
