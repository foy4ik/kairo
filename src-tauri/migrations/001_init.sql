-- Kairo schema v1. SQLite is the source of truth for all persistent data.

CREATE TABLE workspaces (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE projects (
  id           INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'active'
               CHECK (status IN ('active','paused','completed','archived')),
  color        TEXT NOT NULL DEFAULT '#6366f1',
  icon         TEXT NOT NULL DEFAULT 'folder',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE TABLE columns (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL,
  is_done    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_columns_project ON columns(project_id, position);

CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  column_id    INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  priority     TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_at       TEXT,
  position     INTEGER NOT NULL,
  completed_at TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_tasks_column ON tasks(column_id, position);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_completed ON tasks(completed_at);

CREATE TABLE subtasks (
  id        INTEGER PRIMARY KEY,
  task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title     TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  position  INTEGER NOT NULL
);
CREATE INDEX idx_subtasks_task ON subtasks(task_id, position);

CREATE TABLE tags (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE COLLATE NOCASE,
  color TEXT NOT NULL DEFAULT '#64748b'
);

CREATE TABLE task_tags (
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);

CREATE TABLE notes (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_notes_project ON notes(project_id);
CREATE INDEX idx_notes_updated ON notes(updated_at);

CREATE TABLE note_tags (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE note_tasks (
  note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, task_id)
);

CREATE TABLE file_references (
  id         INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path       TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX idx_files_project ON file_references(project_id);

CREATE TABLE focus_sessions (
  id           INTEGER PRIMARY KEY,
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  started_at   TEXT NOT NULL,
  ended_at     TEXT NOT NULL,
  duration_sec INTEGER NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('work','short_break','long_break'))
);
CREATE INDEX idx_sessions_started ON focus_sessions(started_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO workspaces (id, name, created_at) VALUES (1, 'Kairo', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
