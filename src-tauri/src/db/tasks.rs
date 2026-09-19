use super::models::*;
use super::projects::get_column;
use super::{now, require_text};
use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, Row};
use std::collections::HashMap;

const PRIORITIES: [&str; 3] = ["low", "medium", "high"];
const TAG_COLORS: [&str; 8] =
    ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6"];

pub const TASK_COLS: &str =
    "id, project_id, column_id, title, description, priority, due_at, position, completed_at, created_at, updated_at";

pub fn map_task(r: &Row) -> rusqlite::Result<Task> {
    Ok(Task {
        id: r.get(0)?,
        project_id: r.get(1)?,
        column_id: r.get(2)?,
        title: r.get(3)?,
        description: r.get(4)?,
        priority: r.get(5)?,
        due_at: r.get(6)?,
        position: r.get(7)?,
        completed_at: r.get(8)?,
        created_at: r.get(9)?,
        updated_at: r.get(10)?,
        tags: vec![],
        subtasks: vec![],
        note_ids: vec![],
    })
}

fn id_list(ids: &[i64]) -> String {
    ids.iter().map(|i| i.to_string()).collect::<Vec<_>>().join(",")
}

/// Attaches tags, subtasks and linked notes to a batch of tasks with three queries.
pub fn hydrate(conn: &Connection, mut tasks: Vec<Task>) -> AppResult<Vec<Task>> {
    if tasks.is_empty() {
        return Ok(tasks);
    }
    let ids = id_list(&tasks.iter().map(|t| t.id).collect::<Vec<_>>());
    let mut tags: HashMap<i64, Vec<Tag>> = HashMap::new();
    let mut stmt = conn.prepare(&format!(
        "SELECT tt.task_id, g.id, g.name, g.color FROM task_tags tt JOIN tags g ON g.id = tt.tag_id
         WHERE tt.task_id IN ({ids}) ORDER BY g.name"
    ))?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, Tag { id: r.get(1)?, name: r.get(2)?, color: r.get(3)? })))? {
        let (tid, tag) = row?;
        tags.entry(tid).or_default().push(tag);
    }
    let mut subs: HashMap<i64, Vec<Subtask>> = HashMap::new();
    let mut stmt = conn.prepare(&format!(
        "SELECT id, task_id, title, completed, position FROM subtasks WHERE task_id IN ({ids}) ORDER BY position, id"
    ))?;
    for row in stmt.query_map([], |r| {
        Ok(Subtask {
            id: r.get(0)?,
            task_id: r.get(1)?,
            title: r.get(2)?,
            completed: r.get::<_, i64>(3)? != 0,
            position: r.get(4)?,
        })
    })? {
        let s = row?;
        subs.entry(s.task_id).or_default().push(s);
    }
    let mut notes: HashMap<i64, Vec<i64>> = HashMap::new();
    let mut stmt =
        conn.prepare(&format!("SELECT task_id, note_id FROM note_tasks WHERE task_id IN ({ids}) ORDER BY note_id"))?;
    for row in stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))? {
        let (tid, nid) = row?;
        notes.entry(tid).or_default().push(nid);
    }
    for t in tasks.iter_mut() {
        t.tags = tags.remove(&t.id).unwrap_or_default();
        t.subtasks = subs.remove(&t.id).unwrap_or_default();
        t.note_ids = notes.remove(&t.id).unwrap_or_default();
    }
    Ok(tasks)
}

pub fn list_tasks(conn: &Connection, project_id: Option<i64>) -> AppResult<Vec<Task>> {
    let (sql, p): (String, Vec<i64>) = match project_id {
        Some(id) => (
            format!("SELECT {TASK_COLS} FROM tasks WHERE project_id = ?1 ORDER BY column_id, position, id"),
            vec![id],
        ),
        None => (format!("SELECT {TASK_COLS} FROM tasks ORDER BY project_id, column_id, position, id"), vec![]),
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(p), map_task)?;
    hydrate(conn, rows.collect::<Result<_, _>>()?)
}

pub fn get_task(conn: &Connection, id: i64) -> AppResult<Task> {
    let t = conn
        .query_row(&format!("SELECT {TASK_COLS} FROM tasks WHERE id = ?1"), [id], map_task)
        .map_err(|_| AppError::not_found("Task"))?;
    Ok(hydrate(conn, vec![t])?.remove(0))
}

// ---- tags ---------------------------------------------------------------

pub fn list_tags(conn: &Connection) -> AppResult<Vec<Tag>> {
    let mut stmt = conn.prepare("SELECT id, name, color FROM tags ORDER BY name")?;
    let rows = stmt.query_map([], |r| Ok(Tag { id: r.get(0)?, name: r.get(1)?, color: r.get(2)? }))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Finds or creates tags by name (case-insensitive) and returns their ids.
pub fn ensure_tags(conn: &Connection, names: &[String]) -> AppResult<Vec<i64>> {
    let mut out = Vec::new();
    for raw in names {
        let name = raw.trim().trim_start_matches('#');
        if name.is_empty() {
            continue;
        }
        if name.chars().count() > 40 {
            return Err(AppError::validation("Tag is too long (max 40)"));
        }
        let color = TAG_COLORS[name.to_lowercase().bytes().fold(0usize, |a, b| a.wrapping_add(b as usize)) % TAG_COLORS.len()];
        conn.execute("INSERT OR IGNORE INTO tags (name, color) VALUES (?1, ?2)", params![name, color])?;
        let id: i64 = conn.query_row("SELECT id FROM tags WHERE name = ?1", [name], |r| r.get(0))?;
        if !out.contains(&id) {
            out.push(id);
        }
    }
    Ok(out)
}

fn set_task_tags(conn: &Connection, task_id: i64, names: &[String]) -> AppResult<()> {
    let ids = ensure_tags(conn, names)?;
    conn.execute("DELETE FROM task_tags WHERE task_id = ?1", [task_id])?;
    for id in ids {
        conn.execute("INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?1, ?2)", params![task_id, id])?;
    }
    Ok(())
}

// ---- tasks --------------------------------------------------------------

fn check_priority(p: &str) -> AppResult<()> {
    if PRIORITIES.contains(&p) {
        Ok(())
    } else {
        Err(AppError::validation("Unknown priority"))
    }
}

fn check_due(due: &Option<String>) -> AppResult<()> {
    if let Some(d) = due {
        if chrono::DateTime::parse_from_rfc3339(d).is_err() && chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").is_err() {
            return Err(AppError::validation("Deadline must be a valid date"));
        }
    }
    Ok(())
}

pub fn create_task(conn: &mut Connection, input: NewTask) -> AppResult<Task> {
    let title = require_text(&input.title, "Task title", 300)?;
    let priority = input.priority.unwrap_or_else(|| "medium".into());
    check_priority(&priority)?;
    check_due(&input.due_at)?;
    let col = get_column(conn, input.column_id)?;
    if col.project_id != input.project_id {
        return Err(AppError::validation("Column does not belong to the project"));
    }
    let ts = now();
    let tx = conn.transaction()?;
    let pos: i64 =
        tx.query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM tasks WHERE column_id = ?1", [col.id], |r| r.get(0))?;
    tx.execute(
        "INSERT INTO tasks (project_id, column_id, title, description, priority, due_at, position, completed_at, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
        params![
            input.project_id,
            col.id,
            title,
            input.description.trim(),
            priority,
            input.due_at,
            pos,
            if col.is_done { Some(ts.clone()) } else { None },
            ts
        ],
    )?;
    let id = tx.last_insert_rowid();
    set_task_tags(&tx, id, &input.tags)?;
    tx.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts, input.project_id])?;
    tx.commit()?;
    get_task(conn, id)
}

pub fn update_task(conn: &mut Connection, id: i64, patch: TaskPatch) -> AppResult<Task> {
    let cur = get_task(conn, id)?;
    let title = match patch.title {
        Some(t) => require_text(&t, "Task title", 300)?,
        None => cur.title,
    };
    let priority = patch.priority.unwrap_or(cur.priority);
    check_priority(&priority)?;
    let due = match patch.due_at {
        Some(v) => v,
        None => cur.due_at,
    };
    check_due(&due)?;
    let ts = now();
    let tx = conn.transaction()?;
    tx.execute(
        "UPDATE tasks SET title=?1, description=?2, priority=?3, due_at=?4, updated_at=?5 WHERE id=?6",
        params![title, patch.description.map(|d| d.trim().to_string()).unwrap_or(cur.description), priority, due, ts, id],
    )?;
    if let Some(tags) = &patch.tags {
        set_task_tags(&tx, id, tags)?;
    }
    if let Some(notes) = &patch.note_ids {
        tx.execute("DELETE FROM note_tasks WHERE task_id = ?1", [id])?;
        for n in notes {
            tx.execute(
                "INSERT OR IGNORE INTO note_tasks (note_id, task_id) SELECT id, ?2 FROM notes WHERE id = ?1",
                params![n, id],
            )?;
        }
    }
    tx.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts, cur.project_id])?;
    tx.commit()?;
    get_task(conn, id)
}

fn column_task_ids(conn: &Connection, column_id: i64, except: i64) -> AppResult<Vec<i64>> {
    let mut stmt =
        conn.prepare("SELECT id FROM tasks WHERE column_id = ?1 AND id <> ?2 ORDER BY position, id")?;
    let rows = stmt.query_map(params![column_id, except], |r| r.get(0))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn write_positions(conn: &Connection, ids: &[i64]) -> AppResult<()> {
    for (i, id) in ids.iter().enumerate() {
        conn.execute("UPDATE tasks SET position = ?1 WHERE id = ?2", params![i as i64, id])?;
    }
    Ok(())
}

/// Moves a task to `position` (0-based index) inside `column_id`, renumbering both columns transactionally.
pub fn move_task(conn: &mut Connection, id: i64, column_id: i64, position: i64) -> AppResult<Task> {
    let task = get_task(conn, id)?;
    let target = get_column(conn, column_id)?;
    if target.project_id != task.project_id {
        return Err(AppError::validation("Cannot move a task to another project's column"));
    }
    let ts = now();
    let tx = conn.transaction()?;
    let source_col = task.column_id;
    let mut ids = column_task_ids(&tx, column_id, id)?;
    let idx = position.clamp(0, ids.len() as i64) as usize;
    ids.insert(idx, id);
    tx.execute("UPDATE tasks SET column_id = ?1 WHERE id = ?2", params![column_id, id])?;
    write_positions(&tx, &ids)?;
    if source_col != column_id {
        let src = column_task_ids(&tx, source_col, id)?;
        write_positions(&tx, &src)?;
        let completed: Option<String> = if target.is_done { Some(task.completed_at.unwrap_or_else(|| ts.clone())) } else { None };
        tx.execute("UPDATE tasks SET completed_at = ?1 WHERE id = ?2", params![completed, id])?;
    }
    tx.execute("UPDATE tasks SET updated_at = ?1 WHERE id = ?2", params![ts, id])?;
    tx.execute("UPDATE projects SET updated_at = ?1 WHERE id = ?2", params![ts, task.project_id])?;
    tx.commit()?;
    get_task(conn, id)
}

pub fn delete_task(conn: &mut Connection, id: i64) -> AppResult<()> {
    let task = get_task(conn, id)?;
    let tx = conn.transaction()?;
    tx.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    let rest = column_task_ids(&tx, task.column_id, id)?;
    write_positions(&tx, &rest)?;
    tx.commit()?;
    Ok(())
}

// ---- subtasks -----------------------------------------------------------

pub fn add_subtask(conn: &Connection, task_id: i64, title: &str) -> AppResult<Task> {
    let title = require_text(title, "Checklist item", 300)?;
    get_task(conn, task_id)?;
    let pos: i64 =
        conn.query_row("SELECT COALESCE(MAX(position), -1) + 1 FROM subtasks WHERE task_id = ?1", [task_id], |r| r.get(0))?;
    conn.execute(
        "INSERT INTO subtasks (task_id, title, completed, position) VALUES (?1, ?2, 0, ?3)",
        params![task_id, title, pos],
    )?;
    conn.execute("UPDATE tasks SET updated_at = ?1 WHERE id = ?2", params![now(), task_id])?;
    get_task(conn, task_id)
}

pub fn update_subtask(conn: &Connection, id: i64, patch: SubtaskPatch) -> AppResult<Task> {
    let (task_id, title, completed): (i64, String, i64) = conn
        .query_row("SELECT task_id, title, completed FROM subtasks WHERE id = ?1", [id], |r| {
            Ok((r.get(0)?, r.get(1)?, r.get(2)?))
        })
        .map_err(|_| AppError::not_found("Checklist item"))?;
    let title = match patch.title {
        Some(t) => require_text(&t, "Checklist item", 300)?,
        None => title,
    };
    let completed = patch.completed.map(|c| c as i64).unwrap_or(completed);
    conn.execute("UPDATE subtasks SET title = ?1, completed = ?2 WHERE id = ?3", params![title, completed, id])?;
    conn.execute("UPDATE tasks SET updated_at = ?1 WHERE id = ?2", params![now(), task_id])?;
    get_task(conn, task_id)
}

pub fn delete_subtask(conn: &Connection, id: i64) -> AppResult<Task> {
    let task_id: i64 = conn
        .query_row("SELECT task_id FROM subtasks WHERE id = ?1", [id], |r| r.get(0))
        .map_err(|_| AppError::not_found("Checklist item"))?;
    conn.execute("DELETE FROM subtasks WHERE id = ?1", [id])?;
    get_task(conn, task_id)
}
