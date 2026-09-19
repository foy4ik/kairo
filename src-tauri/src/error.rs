use serde::Serialize;
use std::fmt;

/// Structured error returned to the frontend by every IPC command.
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub message: String,
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self { code: code.to_string(), message: message.into() }
    }
    pub fn validation(message: impl Into<String>) -> Self {
        Self::new("VALIDATION", message)
    }
    pub fn not_found(what: &str) -> Self {
        Self::new("NOT_FOUND", format!("{what} not found"))
    }
    pub fn invalid_backup(message: impl Into<String>) -> Self {
        Self::new("INVALID_BACKUP", message)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(e: rusqlite::Error) -> Self {
        match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::new("NOT_FOUND", "Record not found"),
            other => AppError::new("DATABASE", other.to_string()),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        match e.kind() {
            std::io::ErrorKind::NotFound => AppError::new("FILE_NOT_FOUND", e.to_string()),
            _ => AppError::new("IO", e.to_string()),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::invalid_backup(e.to_string())
    }
}
