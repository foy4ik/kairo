use super::models::*;
use super::tasks::ensure_tags;
use super::{now, require_text};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, Row};
use std::collections::HashMap;

const NOTE_COLS: &str = "id, project_id, title, content, created_at, updated_at";

fn map_note(r: &Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id: r.get(0)?,
        project_id: r.get(1)?,
        title: r.get(2)?,
        content: r.get(3)?,
        created_at: r.get(4)?,
        updated_at: r.get(5)?,
        tags: vec![],
        task_ids: vec![],
    })
}

pub fn hydrate(conn: &Connection, mut notes: Vec<Note>) -> AppResult<Vec<Note>> {
    if notes.is_empty() {
        return Ok(notes);
    }
    let ids = notes.iter().map(|n| n.id.to_string()).collect::<Vec<_>>().join(",");
    let mut tags: HashMap<i64, Vec<Tag>> = HashMap::new();
    let mut stmt = conn.prepare(&format!(
        "SELECT nt.note_id, g.id, g.name, g.color FROM note_tags nt JOIN tags g ON g.id = nt.tag_id
         WHERE nt.note_id IN ({ids}) ORDER BY g.name"
    ))?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, Tag { id: r.get(1)?, name: r.get(2)?, color: r.get(3)? })))? {
        let (nid, t) = row?;
        tags.entry(nid).or_default().push(t);
    }
    let mut tasks: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut stmt =
        conn.prepare(&format!("SELECT note_id, task_id FROM note_tasks WHERE note_id IN ({ids}) ORDER BY task_id"))?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))? {
        let (nid, tid) = row?;
        tasks.entry(nid).or_default().push(tid);
    }
    for n in notes.iter_mut() {
        n.tags = tags.remove(&n.id).unwrap_or_default();
        n.task_ids = tasks.remove(&n.id).unwrap_or_default();
    }
    Ok(notes)
}

pub fn list_notes(conn: &Connection, project_id: Option<i64>, limit: Option<i64>) -> AppResult<Vec<Note>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {NOTE_COLS} FROM notes WHERE (?1 IS NULL OR project_id = ?1) ORDER BY updated_at DESC, id DESC LIMIT ?2"
    ))?;
    let rows = stmt.query_map(params![project_id, limit.unwrap_or(-1)], map_note)?;
    hydrate(conn, rows.collect::<Result<_, _>>()?)
}

pub fn get_note(conn: &Connection, id: i64) -> AppResult<Note> {
    let n = conn
        .query_row(&format!("SELECT {NOTE_COLS} FROM notes WHERE id = ?1"), [id], map_note)
        .map_err(|_| AppError::not_found("Note"))?;
    Ok(hydrate(conn, vec![n])?.remove(0))
}

fn apply_links(conn: &Connection, id: i64, input: &NoteInput) -> AppResult<()> {
    let tag_ids = ensure_tags(conn, &input.tags)?;
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", [id])?;
    for t in tag_ids {
        conn.execute("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?1, ?2)", params![id, t])?;
    }
    conn.execute("DELETE FROM note_tasks WHERE note_id = ?1", [id])?;
    for t in &input.task_ids {
        conn.execute(
            "INSERT OR IGNORE INTO note_tasks (note_id, task_id) SELECT ?1, id FROM tasks WHERE id = ?2",
            params![id, t],
        )?;
    }
    Ok(())
}

pub fn create_note(conn: &mut Connection, input: NoteInput) -> AppResult<Note> {
    let title = require_text(&input.title, "Note title", 200)?;
    let ts = now();
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO notes (project_id, title, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?4)",
        params![input.project_id, title, input.content, ts],
    )?;
    let id = tx.last_insert_rowid();
    apply_links(&tx, id, &input)?;
    tx.commit()?;
    get_note(conn, id)
}

/// Saves a note in place (used by autosave). One transaction: content and links never diverge.
pub fn save_note(conn: &mut Connection, id: i64, input: NoteInput) -> AppResult<Note> {
    get_note(conn, id)?;
    let title = require_text(&input.title, "Note title", 200)?;
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE notes SET project_id = ?1, title = ?2, content = ?3, updated_at = ?4 WHERE id = ?5",
        params![input.project_id, title, input.content, now(), id],
    )?;
    apply_links(&tx, id, &input)?;
    tx.commit()?;
    get_note(conn, id)
}

pub fn delete_note(conn: &Connection, id: i64) -> AppResult<()> {
    let n = conn.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    if n == 0 {
        return Err(AppError::not_found("Note"));
    }
    Ok(())
}

pub fn search_notes(conn: &Connection, query: &str) -> AppResult<Vec<Note>> {
    let q = query.trim();
    if q.is_empty() {
        return list_notes(conn, None, None);
    }
    let like = format!("%{}%", q.replace('\\', "\\\\").replace('%', "\\%").replace('_', "\\_"));
    let mut stmt = conn.prepare(&format!(
        "SELECT {NOTE_COLS} FROM notes n
         WHERE title LIKE ?1 ESCAPE '\\' OR content LIKE ?1 ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM note_tags nt JOIN tags g ON g.id = nt.tag_id WHERE nt.note_id = n.id AND g.name LIKE ?1 ESCAPE '\\')
         ORDER BY updated_at DESC LIMIT 200"
    ))?;
    let rows = stmt.query_map([like], map_note)?;
    hydrate(conn, rows.collect::<Result<_, _>>()?)
}
