//! Full export / import. The JSON format is table-driven so export, validation and import can never drift apart.

use super::{now, schema_version};
use crate::error::{AppError, AppResult};
use rusqlite::{types::Value as SqlValue, Connection};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::Path;

const FORMAT: &str = "kairo-backup";
const VERSION: i64 = 1;
const MAX_BACKUP_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Clone, Copy, PartialEq)]
enum K {
    Int,
    Text,
    NullInt,
    NullText,
}

/// Tables in dependency order (parents first).
const TABLES: &[(&str, &[(&str, K)])] = &[
    ("workspaces", &[("id", K::Int), ("name", K::Text), ("created_at", K::Text)]),
    (
        "projects",
        &[
            ("id", K::Int),
            ("workspace_id", K::Int),
            ("name", K::Text),
            ("description", K::Text),
            ("status", K::Text),
            ("color", K::Text),
            ("icon", K::Text),
            ("created_at", K::Text),
            ("updated_at", K::Text),
        ],
    ),
    (
        "columns",
        &[("id", K::Int), ("project_id", K::Int), ("name", K::Text), ("position", K::Int), ("is_done", K::Int)],
    ),
    (
        "tasks",
        &[
            ("id", K::Int),
            ("project_id", K::Int),
            ("column_id", K::Int),
            ("title", K::Text),
            ("description", K::Text),
            ("priority", K::Text),
            ("due_at", K::NullText),
            ("position", K::Int),
            ("completed_at", K::NullText),
            ("created_at", K::Text),
            ("updated_at", K::Text),
        ],
    ),
    (
        "subtasks",
        &[("id", K::Int), ("task_id", K::Int), ("title", K::Text), ("completed", K::Int), ("position", K::Int)],
    ),
    ("tags", &[("id", K::Int), ("name", K::Text), ("color", K::Text)]),
    ("task_tags", &[("task_id", K::Int), ("tag_id", K::Int)]),
    (
        "notes",
        &[
            ("id", K::Int),
            ("project_id", K::NullInt),
            ("title", K::Text),
            ("content", K::Text),
            ("created_at", K::Text),
            ("updated_at", K::Text),
        ],
    ),
    ("note_tags", &[("note_id", K::Int), ("tag_id", K::Int)]),
    ("note_tasks", &[("note_id", K::Int), ("task_id", K::Int)]),
    (
        "file_references",
        &[("id", K::Int), ("project_id", K::Int), ("path", K::Text), ("label", K::Text), ("created_at", K::Text)],
    ),
    (
        "focus_sessions",
        &[
            ("id", K::Int),
            ("task_id", K::NullInt),
            ("project_id", K::NullInt),
            ("started_at", K::Text),
            ("ended_at", K::Text),
            ("duration_sec", K::Int),
            ("type", K::Text),
        ],
    ),
    ("settings", &[("key", K::Text), ("value", K::Text)]),
];

#[derive(Debug, Serialize)]
pub struct BackupSummary {
    pub exported_at: String,
    pub version: i64,
    pub projects: usize,
    pub tasks: usize,
    pub notes: usize,
    pub sessions: usize,
}

pub fn export_value(conn: &Connection) -> AppResult<Value> {
    let mut tables = Map::new();
    for (name, cols) in TABLES {
        let names: Vec<&str> = cols.iter().map(|(c, _)| *c).collect();
        let quoted = names.iter().map(|c| format!("\"{c}\"")).collect::<Vec<_>>().join(", ");
        let mut stmt = conn.prepare(&format!("SELECT {quoted} FROM {name} ORDER BY rowid"))?;
        let rows = stmt.query_map([], |r| {
            let mut obj = Map::new();
            for (i, (col, _)) in cols.iter().enumerate() {
                let v: SqlValue = r.get(i)?;
                obj.insert(
                    (*col).to_string(),
                    match v {
                        SqlValue::Null => Value::Null,
                        SqlValue::Integer(n) => json!(n),
                        SqlValue::Real(f) => json!(f),
                        SqlValue::Text(s) => json!(s),
                        SqlValue::Blob(_) => Value::Null,
                    },
                );
            }
            Ok(Value::Object(obj))
        })?;
        tables.insert((*name).to_string(), Value::Array(rows.collect::<Result<_, _>>()?));
    }
    Ok(json!({
        "format": FORMAT,
        "version": VERSION,
        "schema_version": schema_version(),
        "app_version": env!("CARGO_PKG_VERSION"),
        "exported_at": now(),
        "tables": tables,
    }))
}

pub fn export_to_file(conn: &Connection, path: &Path) -> AppResult<()> {
    let text = serde_json::to_string_pretty(&export_value(conn)?)?;
    std::fs::write(path, text)?;
    Ok(())
}

/// Consistent copy of the whole database file (technical backup). Overwrites `path`.
pub fn backup_database(conn: &Connection, path: &Path) -> AppResult<()> {
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    conn.execute("VACUUM INTO ?1", [path.to_string_lossy().as_ref()])?;
    Ok(())
}

fn type_ok(v: &Value, k: K) -> bool {
    match k {
        K::Int => v.is_i64() || v.is_u64(),
        K::Text => v.is_string(),
        K::NullInt => v.is_null() || v.is_i64() || v.is_u64(),
        K::NullText => v.is_null() || v.is_string(),
    }
}

/// Structural validation. Nothing is written to the database here.
pub fn validate_value(v: &Value) -> AppResult<BackupSummary> {
    let root = v.as_object().ok_or_else(|| AppError::invalid_backup("The file is not a Kairo backup"))?;
    if root.get("format").and_then(Value::as_str) != Some(FORMAT) {
        return Err(AppError::invalid_backup("The file is not a Kairo backup"));
    }
    let version = root.get("version").and_then(Value::as_i64).unwrap_or(0);
    if version < 1 || version > VERSION {
        return Err(AppError::invalid_backup(format!("Unsupported backup version: {version}")));
    }
    let tables = root
        .get("tables")
        .and_then(Value::as_object)
        .ok_or_else(|| AppError::invalid_backup("The backup has no data section"))?;
    for (name, cols) in TABLES {
        let rows = tables
            .get(*name)
            .and_then(Value::as_array)
            .ok_or_else(|| AppError::invalid_backup(format!("Table \"{name}\" is missing")))?;
        for (i, row) in rows.iter().enumerate() {
            let obj = row
                .as_object()
                .ok_or_else(|| AppError::invalid_backup(format!("Table \"{name}\", row {}: not an object", i + 1)))?;
            for (col, kind) in *cols {
                match obj.get(*col) {
                    Some(val) if type_ok(val, *kind) => {}
                    _ => {
                        return Err(AppError::invalid_backup(format!(
                            "Table \"{name}\", row {}: invalid value in column \"{col}\"",
                            i + 1
                        )))
                    }
                }
            }
        }
    }
    let count = |t: &str| tables.get(t).and_then(Value::as_array).map(Vec::len).unwrap_or(0);
    Ok(BackupSummary {
        exported_at: root.get("exported_at").and_then(Value::as_str).unwrap_or("").to_string(),
        version,
        projects: count("projects"),
        tasks: count("tasks"),
        notes: count("notes"),
        sessions: count("focus_sessions"),
    })
}

pub fn read_backup_file(path: &Path) -> AppResult<Value> {
    let meta = std::fs::metadata(path)?;
    if meta.len() > MAX_BACKUP_BYTES {
        return Err(AppError::invalid_backup("The file is too large to be a Kairo backup"));
    }
    let text = std::fs::read_to_string(path)?;
    serde_json::from_str(&text).map_err(|e| AppError::invalid_backup(format!("Cannot read JSON: {e}")))
}

pub fn validate_file(path: &Path) -> AppResult<BackupSummary> {
    validate_value(&read_backup_file(path)?)
}

fn sql_value(v: &Value) -> SqlValue {
    match v {
        Value::Null => SqlValue::Null,
        Value::Number(n) => n.as_i64().map(SqlValue::Integer).unwrap_or(SqlValue::Null),
        Value::String(s) => SqlValue::Text(s.clone()),
        _ => SqlValue::Null,
    }
}

fn wipe(tx: &Connection) -> AppResult<()> {
    for (name, _) in TABLES.iter().rev() {
        tx.execute(&format!("DELETE FROM {name}"), [])?;
    }
    Ok(())
}

/// Replaces all data with the backup. The whole operation is a single transaction: on any error nothing changes.
pub fn import_value(conn: &mut Connection, v: &Value) -> AppResult<BackupSummary> {
    let summary = validate_value(v)?;
    let tables = &v["tables"];
    conn.execute_batch("PRAGMA foreign_keys = OFF")?;
    let result = (|| -> AppResult<()> {
        let tx = conn.transaction()?;
        wipe(&tx)?;
        for (name, cols) in TABLES {
            let names = cols.iter().map(|(c, _)| format!("\"{c}\"")).collect::<Vec<_>>().join(", ");
            let marks = (1..=cols.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", ");
            let mut stmt = tx.prepare(&format!("INSERT INTO {name} ({names}) VALUES ({marks})"))?;
            for row in tables[*name].as_array().into_iter().flatten() {
                let vals: Vec<SqlValue> = cols.iter().map(|(c, _)| sql_value(&row[*c])).collect();
                stmt.execute(rusqlite::params_from_iter(vals)).map_err(|e| {
                    AppError::invalid_backup(format!("Table \"{name}\" contains data that cannot be imported: {e}"))
                })?;
            }
        }
        let broken: i64 =
            tx.query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |r| r.get(0)).unwrap_or(0);
        if broken > 0 {
            return Err(AppError::invalid_backup("The backup has broken references between records"));
        }
        let has_ws: i64 = tx.query_row("SELECT COUNT(*) FROM workspaces WHERE id = 1", [], |r| r.get(0))?;
        if has_ws == 0 {
            return Err(AppError::invalid_backup("The backup has no workspace"));
        }
        tx.commit()?;
        Ok(())
    })();
    conn.execute_batch("PRAGMA foreign_keys = ON")?;
    result?;
    Ok(summary)
}

/// Import from a file, first saving the current data next to `safety_dir` so an import can always be undone.
pub fn import_file(conn: &mut Connection, path: &Path, safety_dir: Option<&Path>) -> AppResult<BackupSummary> {
    let v = read_backup_file(path)?;
    validate_value(&v)?;
    if let Some(dir) = safety_dir {
        std::fs::create_dir_all(dir)?;
        let name = format!("before-import-{}.json", chrono::Utc::now().format("%Y%m%d-%H%M%S"));
        export_to_file(conn, &dir.join(name))?;
    }
    import_value(conn, &v)
}

/// Removes all user data but keeps settings (language, theme, timer preferences).
pub fn reset_all(conn: &mut Connection) -> AppResult<()> {
    let tx = conn.transaction()?;
    for (name, _) in TABLES.iter().rev() {
        if *name != "settings" {
            tx.execute(&format!("DELETE FROM {name}"), [])?;
        }
    }
    tx.execute("INSERT INTO workspaces (id, name, created_at) VALUES (1, 'Kairo', ?1)", [now()])?;
    tx.commit()?;
    Ok(())
}
