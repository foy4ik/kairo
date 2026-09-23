//! SQLite access layer. All persistent state lives here; the frontend only caches it.

pub mod analytics;
pub mod backup;
pub mod demo;
pub mod files;
pub mod models;
pub mod notes;
pub mod projects;
pub mod search;
pub mod sessions;
pub mod settings;
pub mod tasks;

use crate::error::{AppError, AppResult};
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

const MIGRATIONS: &[(&str, &str)] = &[
    ("001_init", include_str!("../../migrations/001_init.sql")),
    ("002_note_folder", include_str!("../../migrations/002_note_folder.sql")),
];

/// Shared connection wrapped for Tauri managed state.
pub struct Db(pub Mutex<Connection>);

impl Db {
    pub fn open(path: &Path) -> AppResult<Db> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let conn = Connection::open(path)?;
        Self::from_connection(conn)
    }

    pub fn in_memory() -> AppResult<Db> {
        Self::from_connection(Connection::open_in_memory()?)
    }

    fn from_connection(conn: Connection) -> AppResult<Db> {
        configure(&conn)?;
        migrate(&conn)?;
        Ok(Db(Mutex::new(conn)))
    }

    pub fn lock(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.0.lock().map_err(|_| AppError::new("DATABASE", "Database lock is poisoned"))
    }

    /// Runs `f` with exclusive access to the connection.
    pub fn with<R>(&self, f: impl FnOnce(&mut Connection) -> AppResult<R>) -> AppResult<R> {
        f(&mut *self.lock()?)
    }
}

pub fn configure(conn: &Connection) -> AppResult<()> {
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;
    Ok(())
}

/// Applies pending migrations, tracked through `PRAGMA user_version`.
pub fn migrate(conn: &Connection) -> AppResult<()> {
    let current: usize = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, (_name, sql)) in MIGRATIONS.iter().enumerate().skip(current) {
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
}

pub fn schema_version() -> usize {
    MIGRATIONS.len()
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn require_text(value: &str, what: &str, max: usize) -> AppResult<String> {
    let v = value.trim();
    if v.is_empty() {
        return Err(AppError::validation(format!("{what} must not be empty")));
    }
    if v.chars().count() > max {
        return Err(AppError::validation(format!("{what} is too long (max {max})")));
    }
    Ok(v.to_string())
}
