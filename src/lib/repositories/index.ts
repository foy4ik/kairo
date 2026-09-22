/* Repositories: the only place the UI touches the backend. Each function maps 1:1 to an IPC command. */
import { call } from '@/lib/ipc'
import type {
  Analytics, AppInfo, BackupSummary, Column, FileReference, FocusSession, Note, NoteInput, NewProjectInput,
  NewTaskInput, Project, ProjectPatch, ProjectSummary, SearchResults, SessionType, Settings, Tag, Task, TaskPatch, TimerState,
} from '@/lib/types'

export const projectsRepo = {
  list: () => call<ProjectSummary[]>('get_projects'),
  get: (id: number) => call<Project>('get_project', { id }),
  create: (input: NewProjectInput) => call<Project>('create_project', { input }),
  update: (id: number, patch: ProjectPatch) => call<Project>('update_project', { id, patch }),
  archive: (id: number) => call<Project>('archive_project', { id }),
  remove: (id: number) => call<void>('delete_project', { id }),
  columns: (project_id: number) => call<Column[]>('get_columns', { project_id }),
  createColumn: (project_id: number, name: string) => call<Column>('create_column', { project_id, name }),
  updateColumn: (id: number, patch: { name?: string; is_done?: boolean }) =>
    call<Column>('update_column', { id, name: patch.name ?? null, is_done: patch.is_done ?? null }),
  deleteColumn: (id: number, move_to: number | null) => call<void>('delete_column', { id, move_to }),
  reorderColumns: (project_id: number, ordered_ids: number[]) => call<Column[]>('reorder_columns', { project_id, ordered_ids }),
}

export const tasksRepo = {
  list: (project_id: number | null = null) => call<Task[]>('get_tasks', { project_id }),
  get: (id: number) => call<Task>('get_task', { id }),
  create: (input: NewTaskInput) => call<Task>('create_task', { input }),
  update: (id: number, patch: TaskPatch) => call<Task>('update_task', { id, patch }),
  move: (id: number, column_id: number, position: number) => call<Task>('move_task', { id, column_id, position }),
  remove: (id: number) => call<void>('delete_task', { id }),
  addSubtask: (task_id: number, title: string) => call<Task>('add_subtask', { task_id, title }),
  updateSubtask: (id: number, patch: { title?: string; completed?: boolean }) => call<Task>('update_subtask', { id, patch }),
  removeSubtask: (id: number) => call<Task>('delete_subtask', { id }),
  tags: () => call<Tag[]>('get_tags'),
  search: (query: string) => call<SearchResults>('global_search', { query }),
}

export const notesRepo = {
  list: (project_id: number | null = null, limit: number | null = null) => call<Note[]>('get_notes', { project_id, limit }),
  get: (id: number) => call<Note>('get_note', { id }),
  create: (input: NoteInput) => call<Note>('create_note', { input }),
  save: (id: number, input: NoteInput) => call<Note>('save_note', { id, input }),
  remove: (id: number) => call<void>('delete_note', { id }),
  search: (query: string) => call<Note[]>('search_notes', { query }),
}

export const filesRepo = {
  list: (project_id: number) => call<FileReference[]>('get_file_references', { project_id }),
  add: (project_id: number, path: string, label: string | null = null) => call<FileReference>('add_file_reference', { project_id, path, label }),
  remove: (id: number) => call<void>('remove_file_reference', { id }),
  open: (path: string) => call<void>('open_file', { path }),
  reveal: (path: string) => call<void>('reveal_in_folder', { path }),
  openExternal: (url: string) => call<void>('open_external', { url }),
}

export const timerRepo = {
  state: () => call<TimerState>('get_timer_state'),
  start: (kind: SessionType, task_id: number | null, duration_sec: number | null = null, long_break_every: number | null = null) =>
    call<TimerState>('start_timer', { kind, task_id, duration_sec, long_break_every }),
  pause: () => call<TimerState>('pause_timer'),
  resume: () => call<TimerState>('resume_timer'),
  stop: () => call<TimerState>('stop_timer'),
  complete: () => call<TimerState>('complete_session'),
  sessions: (project_id: number | null = null, task_id: number | null = null, limit: number | null = 100) =>
    call<FocusSession[]>('get_focus_sessions', { project_id, task_id, limit }),
}

export const analyticsRepo = {
  get: (from: string, to: string, tz_offset_min: number) => call<Analytics>('get_analytics', { from, to, tz_offset_min }),
}

export const dataRepo = {
  exportJson: (path: string) => call<void>('export_data', { path }),
  backupDb: (path: string) => call<void>('backup_database', { path }),
  validate: (path: string) => call<BackupSummary>('validate_backup', { path }),
  import: (path: string) => call<BackupSummary>('import_data', { path }),
  reset: () => call<void>('reset_data'),
  loadDemo: (lang: string) => call<void>('load_demo_data', { lang }),
  info: () => call<AppInfo>('get_app_info'),
}

export const settingsRepo = {
  get: () => call<Settings>('get_settings'),
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => call<Settings>('update_setting', { key, value }),
}
