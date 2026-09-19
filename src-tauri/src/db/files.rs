use super::models::FileReference;
use super::now;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, Row};
use std::path::Path;

fn map_file(r: &Row) -> rusqlite::Result<FileReference> {
    let path: String = r.get(2)?;
    Ok(FileReference {
        id: r.get(0)?,
        project_id: r.get(1)?,
        exists: Path::new(&path).exists(),
        path,
        label: r.get(3)?,
        created_at: r.get(4)?,
    })
}

pub fn list_file_references(conn: &Connection, project_id: i64) -> AppResult<Vec<FileReference>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, path, label, created_at FROM file_references WHERE project_id = ?1 ORDER BY created_at, id",
    )?;
    let rows = stmt.query_map([project_id], map_file)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Stores a reference to a local file or folder. Only the path is kept, never the content.
pub fn add_file_reference(conn: &Connection, project_id: i64, path: &str, label: Option<String>) -> AppResult<FileReference> {
    let path = path.trim();
    if path.is_empty() {
        return Err(AppError::validation("Path must not be empty"));
    }
    let p = Path::new(path);
    if !p.exists() {
        return Err(AppError::new("FILE_NOT_FOUND", format!("{path} does not exist")));
    }
    let dup: i64 = conn.query_row(
        "SELECT COUNT(*) FROM file_references WHERE project_id = ?1 AND path = ?2",
        params![project_id, path],
        |r| r.get(0),
    )?;
    if dup > 0 {
        return Err(AppError::new("DUPLICATE", "This file is already attached to the project"));
    }
    let label = label
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .or_else(|| p.file_name().map(|n| n.to_string_lossy().into_owned()))
        .unwrap_or_else(|| path.to_string());
    conn.execute(
        "INSERT INTO file_references (project_id, path, label, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![project_id, path, label, now()],
    )?;
    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, project_id, path, label, created_at FROM file_references WHERE id = ?1",
        [id],
        map_file,
    )
    .map_err(Into::into)
}

pub fn remove_file_reference(conn: &Connection, id: i64) -> AppResult<()> {
    let n = conn.execute("DELETE FROM file_references WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::not_found("File reference"));
    }
    Ok(())
}
