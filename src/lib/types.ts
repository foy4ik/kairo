export type ProjectStatus = 'active' | 'paused' | 'completed' | 'archived'
export type Priority = 'low' | 'medium' | 'high'
export type SessionType = 'work' | 'short_break' | 'long_break'

export interface Project {
  id: number
  workspace_id: number
  name: string
  description: string
  status: ProjectStatus
  color: string
  icon: string
  created_at: string
  updated_at: string
}

export interface ProjectSummary extends Project {
  task_total: number
  task_done: number
  focus_sec: number
}

export interface Column {
  id: number
  project_id: number
  name: string
  position: number
  is_done: boolean
}

export interface Tag {
  id: number
  name: string
  color: string
}

export interface Subtask {
  id: number
  task_id: number
  title: string
  completed: boolean
  position: number
}

export interface Task {
  id: number
  project_id: number
  column_id: number
  title: string
  description: string
  priority: Priority
  due_at: string | null
  position: number
  completed_at: string | null
  created_at: string
  updated_at: string
  tags: Tag[]
  subtasks: Subtask[]
  note_ids: number[]
}

export interface Note {
  id: number
  project_id: number | null
  title: string
  content: string
  created_at: string
  updated_at: string
  tags: Tag[]
  task_ids: number[]
}

export interface FileReference {
  id: number
  project_id: number
  path: string
  label: string
  created_at: string
  exists: boolean
}

export interface FocusSession {
  id: number
  task_id: number | null
  project_id: number | null
  started_at: string
  ended_at: string
  duration_sec: number
  type: SessionType
}

export type TimerPhase = 'idle' | 'running' | 'paused' | 'completed'

export interface TimerState {
  phase: TimerPhase
  type: SessionType
  next_type: SessionType
  task_id: number | null
  project_id: number | null
  total_sec: number
  remaining_sec: number
  started_at: string | null
  completed_work_sessions: number
  /** Work sessions per long break for the cycle currently running (may differ from Settings for a one-off run). */
  long_break_every: number
}

export interface SearchResults {
  projects: Project[]
  tasks: Task[]
  notes: Note[]
}

export interface DayStat { date: string; focus_sec: number; sessions: number; completed_tasks: number }
export interface BreakdownItem { id: number | null; name: string; color: string; focus_sec: number }
export interface Analytics {
  from: string
  to: string
  completed_tasks: number
  sessions: number
  focus_sec: number
  streak: number
  days: DayStat[]
  by_project: BreakdownItem[]
  by_tag: BreakdownItem[]
}

export interface Settings {
  language: 'ru' | 'en'
  theme: 'light' | 'dark' | 'system'
  work_min: number
  short_break_min: number
  long_break_min: number
  long_break_every: number
  notifications: boolean
  sound: boolean
  auto_update: boolean
  onboarded: boolean
}

export interface AppError { code: string; message: string }

export interface AppInfo { version: string; data_dir: string; db_path: string; schema_version: number }
export interface BackupSummary { exported_at: string; version: number; projects: number; tasks: number; notes: number; sessions: number }

export interface NewProjectInput {
  name: string
  description?: string
  color?: string
  icon?: string
  status?: ProjectStatus
  columns?: string[]
}
export type ProjectPatch = Partial<Pick<Project, 'name' | 'description' | 'status' | 'color' | 'icon'>>

export interface NewTaskInput {
  project_id: number
  column_id: number
  title: string
  description?: string
  priority?: Priority
  due_at?: string | null
  tags?: string[]
}
export interface TaskPatch {
  title?: string
  description?: string
  priority?: Priority
  due_at?: string | null
  tags?: string[]
  note_ids?: number[]
}
export interface NoteInput {
  title: string
  content: string
  project_id: number | null
  tags: string[]
  task_ids: number[]
}
