use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
pub struct Project {
    pub id: i64,
    pub workspace_id: i64,
    pub name: String,
    pub description: String,
    pub status: String,
    pub color: String,
    pub icon: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectSummary {
    #[serde(flatten)]
    pub project: Project,
    pub task_total: i64,
    pub task_done: i64,
    pub focus_sec: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Column {
    pub id: i64,
    pub project_id: i64,
    pub name: String,
    pub position: i64,
    pub is_done: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Subtask {
    pub id: i64,
    pub task_id: i64,
    pub title: String,
    pub completed: bool,
    pub position: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Task {
    pub id: i64,
    pub project_id: i64,
    pub column_id: i64,
    pub title: String,
    pub description: String,
    pub priority: String,
    pub due_at: Option<String>,
    pub position: i64,
    pub completed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
    pub subtasks: Vec<Subtask>,
    pub note_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Note {
    pub id: i64,
    pub project_id: Option<i64>,
    pub title: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub tags: Vec<Tag>,
    pub task_ids: Vec<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileReference {
    pub id: i64,
    pub project_id: i64,
    pub path: String,
    pub label: String,
    pub created_at: String,
    pub exists: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FocusSession {
    pub id: i64,
    pub task_id: Option<i64>,
    pub project_id: Option<i64>,
    pub started_at: String,
    pub ended_at: String,
    pub duration_sec: i64,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchResults {
    pub projects: Vec<Project>,
    pub tasks: Vec<Task>,
    pub notes: Vec<Note>,
}

// ---- inputs -------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct NewProject {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub color: Option<String>,
    pub icon: Option<String>,
    pub status: Option<String>,
    /// Localized names of the initial columns; the last one is the "done" column.
    pub columns: Option<Vec<String>>,
}

#[derive(Debug, Default, Deserialize)]
pub struct ProjectPatch {
    pub name: Option<String>,
    pub description: Option<String>,
    pub status: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct NewTask {
    pub project_id: i64,
    pub column_id: i64,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub priority: Option<String>,
    pub due_at: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Default, Deserialize)]
pub struct TaskPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    /// `Some(None)` clears the deadline; absent leaves it unchanged.
    #[serde(default, deserialize_with = "double_option")]
    pub due_at: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub note_ids: Option<Vec<i64>>,
}

fn double_option<'de, D, T>(de: D) -> Result<Option<Option<T>>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(de)?))
}

#[derive(Debug, Default, Deserialize)]
pub struct SubtaskPatch {
    pub title: Option<String>,
    pub completed: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct NoteInput {
    pub title: String,
    #[serde(default)]
    pub content: String,
    pub project_id: Option<i64>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub task_ids: Vec<i64>,
}
