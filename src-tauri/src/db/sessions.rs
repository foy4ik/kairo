use super::models::FocusSession;
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, Row};

const COLS: &str = "id, task_id, project_id, started_at, ended_at, duration_sec, type";

fn map(r: &Row) -> rusqlite::Result<FocusSession> {
    Ok(FocusSession {
        id: r.get(0)?,
        task_id: r.get(1)?,
        project_id: r.get(2)?,
        started_at: r.get(3)?,
        ended_at: r.get(4)?,
        duration_sec: r.get(5)?,
        kind: r.get(6)?,
    })
}

pub fn insert_session(
    conn: &Connection,
    task_id: Option<i64>,
    project_id: Option<i64>,
    started_at: &str,
    ended_at: &str,
    duration_sec: i64,
    kind: &str,
) -> AppResult<FocusSession> {
    if !["work", "short_break", "long_break"].contains(&kind) {
        return Err(AppError::validation("Unknown session type"));
    }
    conn.execute(
        "INSERT INTO focus_sessions (task_id, project_id, started_at, ended_at, duration_sec, type)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![task_id, project_id, started_at, ended_at, duration_sec.max(0), kind],
    )?;
    let id = conn.last_insert_rowid();
    conn.query_row(&format!("SELECT {COLS} FROM focus_sessions WHERE id = ?1"), [id], map).map_err(Into::into)
}

pub fn list_sessions(conn: &Connection, project_id: Option<i64>, task_id: Option<i64>, limit: Option<i64>) -> AppResult<Vec<FocusSession>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {COLS} FROM focus_sessions
         WHERE (?1 IS NULL OR project_id = ?1) AND (?2 IS NULL OR task_id = ?2)
         ORDER BY started_at DESC, id DESC LIMIT ?3"
    ))?;
    let rows = stmt.query_map(params![project_id, task_id, limit.unwrap_or(200)], map)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Resolves the project of a task so sessions stay attributable even if the task is later deleted.
pub fn project_of_task(conn: &Connection, task_id: i64) -> AppResult<i64> {
    conn.query_row("SELECT project_id FROM tasks WHERE id = ?1", [task_id], |r| r.get(0))
        .map_err(|_| AppError::not_found("Task"))
}
