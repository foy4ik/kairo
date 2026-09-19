//! Thin IPC layer: validates input, delegates to `db::*` / `services::*`, returns structured errors.
//! Commands are `async` so blocking SQLite work never runs on the UI thread.

pub mod analytics;
pub mod data;
pub mod files;
pub mod notes;
pub mod projects;
pub mod settings;
pub mod tasks;
pub mod timer;
