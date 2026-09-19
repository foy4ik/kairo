use super::models::*;
use super::notes::{hydrate as hydrate_notes, search_notes};
use super::projects::{map_project, PROJECT_COLS};
use super::tasks::{hydrate as hydrate_tasks, map_task, TASK_COLS};
use crate::error::AppResult;
use rusqlite::Connection;

fn like(q: &str) -> String {
    format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"))
}

/// Global search across projects, tasks and notes (case-insensitive substring match).
pub fn global_search(conn: &Connection, query: &str) -> AppResult<SearchResults> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(SearchResults { projects: vec![], tasks: vec![], notes: vec![] });
    }
    let pat = like(q);

    let mut stmt = conn.prepare(&format!(
        "SELECT {PROJECT_COLS} FROM projects WHERE name LIKE ?1 ESCAPE '\\' OR description LIKE ?1 ESCAPE '\\'
         ORDER BY updated_at DESC LIMIT 20"
    ))?;
    let projects = stmt
        .query_map([&pat], map_project)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut stmt = conn.prepare(&format!(
        "SELECT {TASK_COLS} FROM tasks t
         WHERE title LIKE ?1 ESCAPE '\\' OR description LIKE ?1 ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM task_tags tt JOIN tags g ON g.id = tt.tag_id WHERE tt.task_id = t.id AND g.name LIKE ?1 ESCAPE '\\')
         ORDER BY updated_at DESC LIMIT 30"
    ))?;
    let tasks = stmt
        .query_map([&pat], map_task)?
        .collect::<Result<Vec<_>, _>>()?;

    let mut notes = search_notes(conn, q)?;
    notes.truncate(30);
    Ok(SearchResults {
        projects,
        tasks: hydrate_tasks(conn, tasks)?,
        notes: hydrate_notes(conn, notes)?,
    })
}
