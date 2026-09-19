use super::models::*;
use super::{now, require_text};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, Row};

const STATUSES: [&str; 4] = ["active", "paused", "completed", "archived"];

pub fn map_project(r: &Row) -> rusqlite::Result<Project> {
    Ok(Project {
        id: r.get(0)?,
        workspace_id: r.get(1)?,
        name: r.get(2)?,
        description: r.get(3)?,
        status: r.get(4)?,
        color: r.get(5)?,
        icon: r.get(6)?,
        created_at: r.get(7)?,
        updated_at: r.get(8)?,
    })
}

pub const PROJECT_COLS: &str =
    "id, workspace_id, name, description, status, color, icon, created_at, updated_at";

pub fn get_project(conn: &Connection, id: i64) -> AppResult<Project> {
    conn.query_row(&format!("SELECT {PROJECT_COLS} FROM projects WHERE id = ?1"), [id], map_project)
        .map_err(|_| AppError::not_found("Project"))
}

pub fn list_projects(conn: &Connection) -> AppResult<Vec<ProjectSummary>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {PROJECT_COLS},
           (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id),
           (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.completed_at IS NOT NULL),
           (SELECT COALESCE(SUM(duration_sec),0) FROM focus_sessions f WHERE f.project_id = p.id AND f.type = 'work')
         FROM projects p
         ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'completed' THEN 2 ELSE 3 END, updated_at DESC"
    ))?;
    let rows = stmt.query_map([], |r| {
        Ok(ProjectSummary {
            project: map_project(r)?,
            task_total: r.get(9)?,
            task_done: r.get(10)?,
            focus_sec: r.get(11)?,
        })
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn create_project(conn: &mut Connection, input: NewProject) -> AppResult<Project> {
    let name = require_text(&input.name, "Project name", 120)?;
    let status = input.status.unwrap_or_else(|| "active".into());
    if !STATUSES.contains(&status.as_str()) {
        return Err(AppError::validation("Unknown project status"));
    }
    let ts = now();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO projects (workspace_id, name, description, status, color, icon, created_at, updated_at)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?6)",
        params![
            name,
            input.description.trim(),
            status,
            input.color.unwrap_or_else(|| "#6366f1".into()),
            input.icon.unwrap_or_else(|| "folder".into()),
            ts
        ],
    )?;
    let id = tx.last_insert_rowid();
    let names = input
        .columns
        .filter(|c| !c.is_empty())
        .unwrap_or_else(|| vec!["Backlog".into(), "In Progress".into(), "Done".into()]);
    let last = names.len().saturating_sub(1);
    for (i, n) in names.iter().enumerate() {
        tx.execute(
            "INSERT INTO columns (project_id, name, position, is_done) VALUES (?1, ?2, ?3, ?4)",
            params![id, n.trim(), i as i64, (i == last) as i64],
        )?;
    }
    tx.commit()?;
    get_project(conn, id)
}

pub fn update_project(conn: &Connection, id: i64, patch: ProjectPatch) -> AppResult<Project> {
    let current = get_project(conn, id)?;
    let name = match patch.name {
        Some(n) => require_text(&n, "Project name", 120)?,
        None => current.name,
    };
    let status = patch.status.unwrap_or(current.status);
    if !STATUSES.contains(&status.as_str()) {
        return Err(AppError::validation("Unknown project status"));
    }
    conn.execute(
        "UPDATE projects SET name=?1, description=?2, status=?3, color=?4, icon=?5, updated_at=?6 WHERE id=?7",
        params![
            name,
            patch.description.map(|d| d.trim().to_string()).unwrap_or(current.description),
            status,
            patch.color.unwrap_or(current.color),
            patch.icon.unwrap_or(current.icon),
            now(),
            id
        ],
    )?;
    get_project(conn, id)
}

pub fn archive_project(conn: &Connection, id: i64) -> AppResult<Project> {
    update_project(conn, id, ProjectPatch { status: Some("archived".into()), ..Default::default() })
}

pub fn delete_project(conn: &Connection, id: i64) -> AppResult<()> {
    let n = conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::not_found("Project"));
    }
    Ok(())
}

// ---- columns ------------------------------------------------------------

fn map_column(r: &Row) -> rusqlite::Result<Column> {
    Ok(Column {
        id: r.get(0)?,
        project_id: r.get(1)?,
        name: r.get(2)?,
        position: r.get(3)?,
        is_done: r.get::<_, i64>(4)? != 0,
    })
}

pub fn list_columns(conn: &Connection, project_id: i64) -> AppResult<Vec<Column>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, position, is_done FROM columns WHERE project_id = ?1 ORDER BY position, id",
    )?;
    let rows = stmt.query_map([project_id], map_column)?;
    Ok(rows.collect::<Result<_, _>>()?)
}

pub fn get_column(conn: &Connection, id: i64) -> AppResult<Column> {
    conn.query_row(
        "SELECT id, project_id, name, position, is_done FROM columns WHERE id = ?1",
        [id],
        map_column,
    )
    .map_err(|_| AppError::not_found("Column"))
}

pub fn create_column(conn: &Connection, project_id: i64, name: &str) -> AppResult<Column> {
    let name = require_text(name, "Column name", 60)?;
    get_project(conn, project_id)?;
    let pos: i64 = conn.query_row(
        "SELECT COALESCE(MAX(position), -1) + 1 FROM columns WHERE project_id = ?1",
        [project_id],
        |r| r.get(0),
    )?;
    conn.execute(
        "INSERT INTO columns (project_id, name, position, is_done) VALUES (?1, ?2, ?3, 0)",
        params![project_id, name, pos],
    )?;
    get_column(conn, conn.last_insert_rowid())
}

/// Renames a column and/or marks it as the "done" column (only one per project).
pub fn update_column(
    conn: &mut Connection,
    id: i64,
    name: Option<String>,
    is_done: Option<bool>,
) -> AppResult<Column> {
    let col = get_column(conn, id)?;
    let tx = conn.transaction()?;
    if let Some(n) = name {
        tx.execute(
            "UPDATE columns SET name = ?1 WHERE id = ?2",
            params![require_text(&n, "Column name", 60)?, id],
        )?;
    }
    if let Some(done) = is_done {
        if done {
            tx.execute("UPDATE columns SET is_done = 0 WHERE project_id = ?1", [col.project_id])?;
        }
        tx.execute("UPDATE columns SET is_done = ?1 WHERE id = ?2", params![done as i64, id])?;
        if done {
            tx.execute(
                "UPDATE tasks SET completed_at = COALESCE(completed_at, ?1) WHERE column_id = ?2",
                params![now(), id],
            )?;
        }
    }
    tx.commit()?;
    get_column(conn, id)
}

/// Deletes a column; its tasks are moved to `move_to` (required when the column is not empty).
pub fn delete_column(conn: &mut Connection, id: i64, move_to: Option<i64>) -> AppResult<()> {
    let col = get_column(conn, id)?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM tasks WHERE column_id = ?1", [id], |r| r.get(0))?;
    let tx = conn.transaction()?;
    if count > 0 {
        let target = move_to
            .ok_or_else(|| AppError::validation("Column is not empty: choose where to move its tasks"))?;
        let t = get_column(&tx, target)?;
        if t.project_id != col.project_id || target == id {
            return Err(AppError::validation("Invalid target column"));
        }
        let base: i64 = tx.query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE column_id = ?1",
            [target],
            |r| r.get(0),
        )?;
        tx.execute(
            "UPDATE tasks SET column_id = ?1, position = position + ?2,
               completed_at = CASE WHEN ?3 = 1 THEN COALESCE(completed_at, ?4) ELSE NULL END
             WHERE column_id = ?5",
            params![target, base, t.is_done as i64, now(), id],
        )?;
    }
    tx.execute("DELETE FROM columns WHERE id = ?1", [id])?;
    for (i, c) in list_columns(&tx, col.project_id)?.iter().enumerate() {
        tx.execute("UPDATE columns SET position = ?1 WHERE id = ?2", params![i as i64, c.id])?;
    }
    tx.commit()?;
    Ok(())
}

pub fn reorder_columns(conn: &mut Connection, project_id: i64, ordered_ids: &[i64]) -> AppResult<Vec<Column>> {
    let existing = list_columns(conn, project_id)?;
    let mut a: Vec<i64> = existing.iter().map(|c| c.id).collect();
    let mut b = ordered_ids.to_vec();
    a.sort_unstable();
    b.sort_unstable();
    if a != b {
        return Err(AppError::validation("Column list does not match the project's columns"));
    }
    let tx = conn.transaction()?;
    for (i, id) in ordered_ids.iter().enumerate() {
        tx.execute("UPDATE columns SET position = ?1 WHERE id = ?2", params![i as i64, id])?;
    }
    tx.commit()?;
    list_columns(conn, project_id)
}
