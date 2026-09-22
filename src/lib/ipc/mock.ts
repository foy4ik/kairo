/* In-memory backend used when the app runs in a plain browser (dev preview, Playwright E2E).
   It mirrors the Rust commands one-to-one, so the UI cannot tell the difference. */
import type {
  Analytics, AppInfo, BackupSummary, Column, FileReference, FocusSession, Note, Project, ProjectSummary,
  SearchResults, Settings, SessionType, Subtask, Tag, Task, TimerState,
} from '@/lib/types'
import { addDays, dayKey, parseDay } from '@/lib/utils'

export const mockBus = new EventTarget()
const emit = (name: string, detail?: unknown) => mockBus.dispatchEvent(new CustomEvent(name, { detail }))

interface Row { id: number }
interface DB {
  seq: number
  projects: Project[]
  columns: Column[]
  tasks: Array<Omit<Task, 'tags' | 'subtasks' | 'note_ids'>>
  subtasks: Subtask[]
  tags: Tag[]
  task_tags: Array<{ task_id: number; tag_id: number }>
  notes: Array<Omit<Note, 'tags' | 'task_ids'>>
  note_tags: Array<{ note_id: number; tag_id: number }>
  note_tasks: Array<{ note_id: number; task_id: number }>
  files: Array<Omit<FileReference, 'exists'>>
  sessions: FocusSession[]
  settings: Settings
}

const STORE_KEY = 'kairo-mock-db-v1'
const DEFAULT_SETTINGS: Settings = {
  language: 'ru', theme: 'system', work_min: 25, short_break_min: 5, long_break_min: 15,
  long_break_every: 4, notifications: true, sound: true, auto_update: true, page_transitions: true, onboarded: false,
}
const empty = (): DB => ({
  seq: 1, projects: [], columns: [], tasks: [], subtasks: [], tags: [], task_tags: [], notes: [],
  note_tags: [], note_tasks: [], files: [], sessions: [], settings: { ...DEFAULT_SETTINGS },
})

let db: DB = load()
function load(): DB {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (raw) {
      const stored = JSON.parse(raw)
      // Like the Rust backend, fill in defaults for settings that were never stored.
      return { ...empty(), ...stored, settings: { ...DEFAULT_SETTINGS, ...stored.settings } }
    }
  } catch { /* storage unavailable: run in memory */ }
  return empty()
}
function persist() {
  try { window.localStorage.setItem(STORE_KEY, JSON.stringify(db)) } catch { /* ignore */ }
}
const nid = () => db.seq++
const now = () => new Date().toISOString()
const err = (code: string, message: string) => Object.assign(new Error(message), { code, message })
const need = <T extends Row>(list: T[], id: number, what: string): T => {
  const r = list.find((x) => x.id === id)
  if (!r) throw err('NOT_FOUND', `${what} not found`)
  return r
}
const text = (v: unknown, what: string, max: number): string => {
  const s = String(v ?? '').trim()
  if (!s) throw err('VALIDATION', `${what} must not be empty`)
  if (s.length > max) throw err('VALIDATION', `${what} is too long (max ${max})`)
  return s
}

// ---- hydration ----------------------------------------------------------
const tagColors = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6']
function ensureTags(names: string[]): number[] {
  const out: number[] = []
  for (const raw of names) {
    const name = raw.trim().replace(/^#/, '')
    if (!name) continue
    let tag = db.tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (!tag) {
      const sum = [...name.toLowerCase()].reduce((a, c) => a + c.charCodeAt(0), 0)
      tag = { id: nid(), name, color: tagColors[sum % tagColors.length] }
      db.tags.push(tag)
    }
    if (!out.includes(tag.id)) out.push(tag.id)
  }
  return out
}
function hydrateTask(t: DB['tasks'][number]): Task {
  return {
    ...t,
    tags: db.task_tags.filter((x) => x.task_id === t.id).map((x) => db.tags.find((g) => g.id === x.tag_id)!).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)),
    subtasks: db.subtasks.filter((s) => s.task_id === t.id).sort((a, b) => a.position - b.position),
    note_ids: db.note_tasks.filter((x) => x.task_id === t.id).map((x) => x.note_id),
  }
}
function hydrateNote(n: DB['notes'][number]): Note {
  return {
    ...n,
    tags: db.note_tags.filter((x) => x.note_id === n.id).map((x) => db.tags.find((g) => g.id === x.tag_id)!).filter(Boolean),
    task_ids: db.note_tasks.filter((x) => x.note_id === n.id).map((x) => x.task_id),
  }
}
const setTaskTags = (id: number, names: string[]) => {
  db.task_tags = db.task_tags.filter((x) => x.task_id !== id)
  for (const t of ensureTags(names)) db.task_tags.push({ task_id: id, tag_id: t })
}
const colTasks = (columnId: number, except = -1) =>
  db.tasks.filter((t) => t.column_id === columnId && t.id !== except).sort((a, b) => a.position - b.position)
const renumber = (ids: number[]) => ids.forEach((id, i) => { db.tasks.find((t) => t.id === id)!.position = i })

// ---- timer --------------------------------------------------------------
interface MockTimer { phase: TimerState['phase']; kind: SessionType; task_id: number | null; project_id: number | null; total: number; elapsed: number; resumedAt: number | null; startedAt: string | null; completedWork: number; longEvery: number }
const timer: MockTimer = { phase: 'idle', kind: 'work', task_id: null, project_id: null, total: 0, elapsed: 0, resumedAt: null, startedAt: null, completedWork: 0, longEvery: 4 }
let ticker: ReturnType<typeof setInterval> | undefined
const elapsedMs = () => Math.min(timer.total, timer.elapsed + (timer.resumedAt ? Date.now() - timer.resumedAt : 0))
function nextKind(): SessionType {
  if (timer.kind !== 'work') return 'work'
  const after = timer.phase === 'completed' ? timer.completedWork : timer.completedWork + 1
  return after > 0 && after % timer.longEvery === 0 ? 'long_break' : 'short_break'
}
function timerState(): TimerState {
  const remaining = timer.phase === 'idle' || timer.phase === 'completed' ? 0 : Math.max(0, timer.total - elapsedMs())
  return {
    phase: timer.phase, type: timer.kind, next_type: nextKind(), task_id: timer.task_id, project_id: timer.project_id,
    total_sec: Math.floor(timer.total / 1000), remaining_sec: Math.ceil(remaining / 1000),
    started_at: timer.startedAt, completed_work_sessions: timer.completedWork, long_break_every: timer.longEvery,
  }
}
const pushState = () => emit('timer-state', timerState())
function saveSession(kind: SessionType, sec: number) {
  const s: FocusSession = {
    id: nid(), task_id: timer.task_id && db.tasks.some((t) => t.id === timer.task_id) ? timer.task_id : null,
    project_id: timer.project_id, started_at: timer.startedAt ?? now(), ended_at: now(), duration_sec: sec, type: kind,
  }
  db.sessions.push(s)
  persist()
  emit('sessions-changed')
}
function startTicker() {
  if (ticker) return
  ticker = setInterval(() => {
    if (timer.phase !== 'running') return
    if (elapsedMs() >= timer.total) {
      timer.phase = 'completed'
      timer.resumedAt = null
      timer.elapsed = timer.total
      if (timer.kind === 'work') timer.completedWork++
      saveSession(timer.kind, Math.floor(timer.total / 1000))
      emit('timer-completed', { type: timer.kind, duration_sec: Math.floor(timer.total / 1000), state: timerState() })
    }
    pushState()
  }, 250)
}

// ---- analytics ----------------------------------------------------------
function analytics(from: string, to: string): Analytics {
  const start = parseDay(from), end = parseDay(to)
  if (end < start) throw err('VALIDATION', 'Period end is before its start')
  const days = new Map<string, Analytics['days'][number]>()
  for (let d = start; d <= end; d = addDays(d, 1)) days.set(dayKey(d), { date: dayKey(d), focus_sec: 0, sessions: 0, completed_tasks: 0 })
  const work = db.sessions.filter((s) => s.type === 'work')
  for (const s of work) {
    const day = days.get(dayKey(new Date(s.started_at)))
    if (day) { day.sessions++; day.focus_sec += s.duration_sec }
  }
  for (const t of db.tasks) {
    if (!t.completed_at) continue
    const day = days.get(dayKey(new Date(t.completed_at)))
    if (day) day.completed_tasks++
  }
  const inRange = work.filter((s) => days.has(dayKey(new Date(s.started_at))))
  const byProject = new Map<number | null, number>()
  const byTag = new Map<number, number>()
  for (const s of inRange) {
    byProject.set(s.project_id, (byProject.get(s.project_id) ?? 0) + s.duration_sec)
    if (s.task_id) for (const tt of db.task_tags.filter((x) => x.task_id === s.task_id)) byTag.set(tt.tag_id, (byTag.get(tt.tag_id) ?? 0) + s.duration_sec)
  }
  const all = new Set(work.map((s) => dayKey(new Date(s.started_at))))
  let cursor = new Date()
  if (!all.has(dayKey(cursor))) cursor = addDays(cursor, -1)
  let streak = 0
  while (all.has(dayKey(cursor))) { streak++; cursor = addDays(cursor, -1) }
  const list = [...days.values()]
  return {
    from, to, streak,
    completed_tasks: list.reduce((a, d) => a + d.completed_tasks, 0),
    sessions: list.reduce((a, d) => a + d.sessions, 0),
    focus_sec: list.reduce((a, d) => a + d.focus_sec, 0),
    days: list,
    by_project: [...byProject].map(([id, sec]) => {
      const p = db.projects.find((x) => x.id === id)
      return { id, name: p?.name ?? '', color: p?.color ?? '#94a3b8', focus_sec: sec }
    }).sort((a, b) => b.focus_sec - a.focus_sec),
    by_tag: [...byTag].map(([id, sec]) => {
      const g = db.tags.find((x) => x.id === id)!
      return { id, name: g.name, color: g.color, focus_sec: sec }
    }).sort((a, b) => b.focus_sec - a.focus_sec),
  }
}

// ---- backup -------------------------------------------------------------
const pendingImports = new Map<string, string>()
export function registerMockImport(path: string, content: string) { pendingImports.set(path, content) }
function download(name: string, content: string) {
  try {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch { /* ignore */ }
}
const TABLES = ['projects', 'columns', 'tasks', 'subtasks', 'tags', 'task_tags', 'notes', 'note_tags', 'note_tasks', 'files', 'sessions'] as const
function validateBackup(raw: string): { data: DB; summary: BackupSummary } {
  let v: Record<string, unknown>
  try { v = JSON.parse(raw) } catch { throw err('INVALID_BACKUP', 'Cannot read JSON') }
  if (!v || v.format !== 'kairo-backup') throw err('INVALID_BACKUP', 'The file is not a Kairo backup')
  if (typeof v.version !== 'number' || v.version < 1 || v.version > 1) throw err('INVALID_BACKUP', `Unsupported backup version: ${String(v.version)}`)
  const t = v.tables as Record<string, unknown[]> | undefined
  if (!t) throw err('INVALID_BACKUP', 'The backup has no data section')
  for (const name of TABLES) if (!Array.isArray(t[name])) throw err('INVALID_BACKUP', `Table "${name}" is missing`)
  return {
    data: { ...empty(), ...(t as unknown as Partial<DB>), seq: Number(v.seq) || 1, settings: { ...DEFAULT_SETTINGS, ...(v.settings as object) } },
    summary: { exported_at: String(v.exported_at ?? ''), version: 1, projects: t.projects.length, tasks: t.tasks.length, notes: t.notes.length, sessions: t.sessions.length },
  }
}

// ---- demo ---------------------------------------------------------------
function demo(lang: string) {
  const en = lang === 'en'
  const tr = (ru: string, e: string) => (en ? e : ru)
  const cols = [tr('Бэклог', 'Backlog'), tr('В работе', 'In Progress'), tr('Готово', 'Done')]
  const mk = (name: string, description: string, color: string, icon: string) =>
    handlers.create_project({ input: { name, description, color, icon, columns: cols } }) as Project
  const p1 = mk(tr('Запуск Kairo', 'Kairo Launch'), tr('Подготовка релиза десктопного приложения.', 'Preparing the desktop app release.'), '#6366f1', 'rocket')
  const p2 = mk(tr('Сайт-портфолио', 'Portfolio Website'), tr('Личный сайт с кейсами.', 'Personal site with case studies.'), '#10b981', 'globe')
  const cid = (p: Project, i: number) => db.columns.filter((c) => c.project_id === p.id).sort((a, b) => a.position - b.position)[i].id
  const spec: Array<[Project, number, string, string, string, string[], number?]> = [
    [p1, 2, tr('Спроектировать схему БД', 'Design the database schema'), 'high', '', ['backend'], 6],
    [p1, 2, tr('Собрать канбан-доску', 'Build the Kanban board'), 'high', '', ['frontend'], 4],
    [p1, 1, tr('Реализовать фокус-таймер', 'Implement the focus timer'), 'high', dayKey(addDays(new Date(), 1)), ['frontend', 'native']],
    [p1, 1, tr('Написать README и кейс', 'Write the README and case study'), 'medium', dayKey(addDays(new Date(), 3)), ['docs']],
    [p1, 0, tr('Записать демо-ролик', 'Record the demo video'), 'medium', dayKey(addDays(new Date(), 6)), ['docs']],
    [p2, 1, tr('Нарисовать главную страницу', 'Design the home page'), 'high', dayKey(addDays(new Date(), 2)), ['design']],
    [p2, 0, tr('Написать первую статью', 'Write the first article'), 'low', '', ['docs']],
  ]
  const ids: number[] = []
  for (const [p, c, title, prio, due, tags, doneAgo] of spec) {
    const t = handlers.create_task({ input: { project_id: p.id, column_id: cid(p, c), title, priority: prio, due_at: due || null, tags } }) as Task
    if (doneAgo !== undefined) db.tasks.find((x) => x.id === t.id)!.completed_at = addDays(new Date(), -doneAgo).toISOString()
    ids.push(t.id)
  }
  handlers.add_subtask({ task_id: ids[2], title: tr('Логика таймера', 'Timer logic') })
  handlers.add_subtask({ task_id: ids[2], title: tr('Иконка в трее', 'Tray icon') })
  db.subtasks[0].completed = true
  handlers.create_note({ input: { title: tr('Архитектура Kairo', 'Kairo architecture'), project_id: p1.id, tags: ['architecture'], task_ids: [ids[0], ids[2]], content: tr('# Архитектура\n\n1. **React UI**\n2. **Репозитории**\n3. **Rust** — источник истины\n\n> SQLite — источник истины, Zustand — кэш.\n\n- [x] Схема БД\n- [ ] Аналитика\n', '# Architecture\n\n1. **React UI**\n2. **Repositories**\n3. **Rust** — source of truth\n\n> SQLite is the source of truth, Zustand is a cache.\n\n- [x] Database schema\n- [ ] Analytics\n') } })
  handlers.create_note({ input: { title: tr('Идеи для демо-ролика', 'Demo video ideas'), project_id: p1.id, tags: ['docs'], task_ids: [ids[4]], content: tr('# Сценарий\n\n1. Dashboard\n2. Новая задача клавишей `N`\n3. Фокус\n', '# Script\n\n1. Dashboard\n2. New task with the `N` key\n3. Focus\n') } })
  const hist: Array<[number, number, number]> = [[9, 9, 0], [8, 10, 0], [6, 9, 1], [5, 14, 1], [4, 10, 1], [3, 15, 0], [2, 9, 2], [2, 10, 2], [1, 10, 2], [1, 11, 2], [0, 8, 2]]
  for (const [ago, hour, ti] of hist) {
    const d = addDays(new Date(), -ago); d.setHours(hour, 0, 0, 0)
    if (d.getTime() + 25 * 60000 > Date.now()) continue
    const task = db.tasks.find((t) => t.id === ids[ti])!
    db.sessions.push({ id: nid(), task_id: task.id, project_id: task.project_id, started_at: d.toISOString(), ended_at: new Date(d.getTime() + 25 * 60000).toISOString(), duration_sec: 1500, type: 'work' })
  }
}

// ---- command handlers ---------------------------------------------------
type A = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const handlers: Record<string, (a: A) => unknown> = {
  get_projects: (): ProjectSummary[] =>
    db.projects.map((p) => ({
      ...p,
      task_total: db.tasks.filter((t) => t.project_id === p.id).length,
      task_done: db.tasks.filter((t) => t.project_id === p.id && t.completed_at).length,
      focus_sec: db.sessions.filter((s) => s.project_id === p.id && s.type === 'work').reduce((x, s) => x + s.duration_sec, 0),
    })).sort((a, b) => ['active', 'paused', 'completed', 'archived'].indexOf(a.status) - ['active', 'paused', 'completed', 'archived'].indexOf(b.status) || b.updated_at.localeCompare(a.updated_at)),
  get_project: (a) => need(db.projects, a.id, 'Project'),
  create_project: ({ input }) => {
    const name = text(input.name, 'Project name', 120)
    const p: Project = { id: nid(), workspace_id: 1, name, description: (input.description ?? '').trim(), status: input.status ?? 'active', color: input.color ?? '#6366f1', icon: input.icon ?? 'folder', created_at: now(), updated_at: now() }
    db.projects.push(p)
    const names: string[] = input.columns?.length ? input.columns : ['Backlog', 'In Progress', 'Done']
    names.forEach((n, i) => db.columns.push({ id: nid(), project_id: p.id, name: n.trim(), position: i, is_done: i === names.length - 1 }))
    persist()
    return p
  },
  update_project: ({ id, patch }) => {
    const p = need(db.projects, id, 'Project')
    if (patch.name !== undefined) p.name = text(patch.name, 'Project name', 120)
    for (const k of ['description', 'status', 'color', 'icon'] as const) if (patch[k] !== undefined) (p as any)[k] = patch[k] // eslint-disable-line @typescript-eslint/no-explicit-any
    p.updated_at = now(); persist()
    return p
  },
  archive_project: ({ id }) => handlers.update_project({ id, patch: { status: 'archived' } }),
  delete_project: ({ id }) => {
    need(db.projects, id, 'Project')
    const taskIds = db.tasks.filter((t) => t.project_id === id).map((t) => t.id)
    db.projects = db.projects.filter((p) => p.id !== id)
    db.columns = db.columns.filter((c) => c.project_id !== id)
    db.tasks = db.tasks.filter((t) => t.project_id !== id)
    db.subtasks = db.subtasks.filter((s) => !taskIds.includes(s.task_id))
    db.task_tags = db.task_tags.filter((x) => !taskIds.includes(x.task_id))
    db.note_tasks = db.note_tasks.filter((x) => !taskIds.includes(x.task_id))
    db.files = db.files.filter((f) => f.project_id !== id)
    db.notes.forEach((n) => { if (n.project_id === id) n.project_id = null })
    db.sessions.forEach((s) => { if (s.project_id === id) s.project_id = null; if (s.task_id && taskIds.includes(s.task_id)) s.task_id = null })
    persist()
  },
  get_columns: ({ project_id }) => db.columns.filter((c) => c.project_id === project_id).sort((a, b) => a.position - b.position),
  create_column: ({ project_id, name }) => {
    need(db.projects, project_id, 'Project')
    const c: Column = { id: nid(), project_id, name: text(name, 'Column name', 60), position: db.columns.filter((x) => x.project_id === project_id).length, is_done: false }
    db.columns.push(c); persist()
    return c
  },
  update_column: ({ id, name, is_done }) => {
    const c = need(db.columns, id, 'Column')
    if (name !== undefined && name !== null) c.name = text(name, 'Column name', 60)
    if (is_done !== undefined && is_done !== null) {
      if (is_done) db.columns.filter((x) => x.project_id === c.project_id).forEach((x) => { x.is_done = false })
      c.is_done = is_done
      if (is_done) db.tasks.filter((t) => t.column_id === id).forEach((t) => { t.completed_at ??= now() })
    }
    persist()
    return c
  },
  delete_column: ({ id, move_to }) => {
    const c = need(db.columns, id, 'Column')
    const inCol = colTasks(id)
    if (inCol.length) {
      if (move_to == null) throw err('VALIDATION', 'Column is not empty: choose where to move its tasks')
      const target = need(db.columns, move_to, 'Column')
      const base = colTasks(target.id).length
      inCol.forEach((t, i) => { t.column_id = target.id; t.position = base + i; t.completed_at = target.is_done ? (t.completed_at ?? now()) : null })
    }
    db.columns = db.columns.filter((x) => x.id !== id)
    db.columns.filter((x) => x.project_id === c.project_id).sort((a, b) => a.position - b.position).forEach((x, i) => { x.position = i })
    persist()
  },
  reorder_columns: ({ project_id, ordered_ids }) => {
    ;(ordered_ids as number[]).forEach((id, i) => { need(db.columns, id, 'Column').position = i })
    persist()
    return handlers.get_columns({ project_id })
  },
  get_tasks: ({ project_id }) => db.tasks.filter((t) => project_id == null || t.project_id === project_id).sort((a, b) => a.column_id - b.column_id || a.position - b.position).map(hydrateTask),
  get_task: ({ id }) => hydrateTask(need(db.tasks, id, 'Task')),
  create_task: ({ input }) => {
    const title = text(input.title, 'Task title', 300)
    const col = need(db.columns, input.column_id, 'Column')
    if (col.project_id !== input.project_id) throw err('VALIDATION', 'Column does not belong to the project')
    const t = { id: nid(), project_id: input.project_id, column_id: col.id, title, description: (input.description ?? '').trim(), priority: input.priority ?? 'medium', due_at: input.due_at ?? null, position: colTasks(col.id).length, completed_at: col.is_done ? now() : null, created_at: now(), updated_at: now() }
    db.tasks.push(t)
    setTaskTags(t.id, input.tags ?? [])
    need(db.projects, t.project_id, 'Project').updated_at = now()
    persist()
    return hydrateTask(t)
  },
  update_task: ({ id, patch }) => {
    const t = need(db.tasks, id, 'Task')
    if (patch.title !== undefined) t.title = text(patch.title, 'Task title', 300)
    if (patch.description !== undefined) t.description = String(patch.description).trim()
    if (patch.priority !== undefined) t.priority = patch.priority
    if ('due_at' in patch) t.due_at = patch.due_at ?? null
    if (patch.tags) setTaskTags(id, patch.tags)
    if (patch.note_ids) {
      db.note_tasks = db.note_tasks.filter((x) => x.task_id !== id)
      for (const n of patch.note_ids as number[]) if (db.notes.some((x) => x.id === n)) db.note_tasks.push({ note_id: n, task_id: id })
    }
    t.updated_at = now(); persist()
    return hydrateTask(t)
  },
  move_task: ({ id, column_id, position }) => {
    const t = need(db.tasks, id, 'Task')
    const target = need(db.columns, column_id, 'Column')
    if (target.project_id !== t.project_id) throw err('VALIDATION', "Cannot move a task to another project's column")
    const from = t.column_id
    const ids = colTasks(column_id, id).map((x) => x.id)
    ids.splice(Math.max(0, Math.min(position, ids.length)), 0, id)
    t.column_id = column_id
    renumber(ids)
    if (from !== column_id) {
      renumber(colTasks(from, id).map((x) => x.id))
      t.completed_at = target.is_done ? (t.completed_at ?? now()) : null
    }
    t.updated_at = now(); persist()
    return hydrateTask(t)
  },
  delete_task: ({ id }) => {
    const t = need(db.tasks, id, 'Task')
    db.tasks = db.tasks.filter((x) => x.id !== id)
    db.subtasks = db.subtasks.filter((s) => s.task_id !== id)
    db.task_tags = db.task_tags.filter((x) => x.task_id !== id)
    db.note_tasks = db.note_tasks.filter((x) => x.task_id !== id)
    db.sessions.forEach((s) => { if (s.task_id === id) s.task_id = null })
    renumber(colTasks(t.column_id).map((x) => x.id))
    persist()
  },
  add_subtask: ({ task_id, title }) => {
    need(db.tasks, task_id, 'Task')
    db.subtasks.push({ id: nid(), task_id, title: text(title, 'Checklist item', 300), completed: false, position: db.subtasks.filter((s) => s.task_id === task_id).length })
    persist()
    return hydrateTask(need(db.tasks, task_id, 'Task'))
  },
  update_subtask: ({ id, patch }) => {
    const s = need(db.subtasks, id, 'Checklist item')
    if (patch.title !== undefined) s.title = text(patch.title, 'Checklist item', 300)
    if (patch.completed !== undefined) s.completed = !!patch.completed
    persist()
    return hydrateTask(need(db.tasks, s.task_id, 'Task'))
  },
  delete_subtask: ({ id }) => {
    const s = need(db.subtasks, id, 'Checklist item')
    db.subtasks = db.subtasks.filter((x) => x.id !== id); persist()
    return hydrateTask(need(db.tasks, s.task_id, 'Task'))
  },
  get_tags: () => [...db.tags].sort((a, b) => a.name.localeCompare(b.name)),
  global_search: ({ query }): SearchResults => {
    const q = String(query).trim().toLowerCase()
    if (!q) return { projects: [], tasks: [], notes: [] }
    const has = (s: string) => s.toLowerCase().includes(q)
    return {
      projects: db.projects.filter((p) => has(p.name) || has(p.description)).slice(0, 20),
      tasks: db.tasks.filter((t) => has(t.title) || has(t.description)).slice(0, 30).map(hydrateTask),
      notes: (handlers.search_notes({ query }) as Note[]).slice(0, 30),
    }
  },
  get_notes: ({ project_id, limit }) => db.notes.filter((n) => project_id == null || n.project_id === project_id).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit ?? 9999).map(hydrateNote),
  get_note: ({ id }) => hydrateNote(need(db.notes, id, 'Note')),
  create_note: ({ input }) => {
    const n = { id: nid(), project_id: input.project_id ?? null, title: text(input.title, 'Note title', 200), content: input.content ?? '', created_at: now(), updated_at: now() }
    db.notes.push(n)
    return applyNoteLinks(n.id, input)
  },
  save_note: ({ id, input }) => {
    const n = need(db.notes, id, 'Note')
    n.title = text(input.title, 'Note title', 200); n.content = input.content ?? ''; n.project_id = input.project_id ?? null; n.updated_at = now()
    return applyNoteLinks(id, input)
  },
  delete_note: ({ id }) => {
    need(db.notes, id, 'Note')
    db.notes = db.notes.filter((n) => n.id !== id)
    db.note_tags = db.note_tags.filter((x) => x.note_id !== id)
    db.note_tasks = db.note_tasks.filter((x) => x.note_id !== id)
    persist()
  },
  search_notes: ({ query }) => {
    const q = String(query).trim().toLowerCase()
    return db.notes.map(hydrateNote).filter((n) => !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.name.toLowerCase().includes(q))).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  },
  get_file_references: ({ project_id }): FileReference[] => db.files.filter((f) => f.project_id === project_id).map((f) => ({ ...f, exists: !f.path.includes('missing') })),
  add_file_reference: ({ project_id, path, label }) => {
    const p = String(path).trim()
    if (!p) throw err('VALIDATION', 'Path must not be empty')
    if (db.files.some((f) => f.project_id === project_id && f.path === p)) throw err('DUPLICATE', 'This file is already attached to the project')
    const f = { id: nid(), project_id, path: p, label: (label ?? '').trim() || p.split(/[\\/]/).pop() || p, created_at: now() }
    db.files.push(f); persist()
    return { ...f, exists: !p.includes('missing') }
  },
  remove_file_reference: ({ id }) => { need(db.files, id, 'File reference'); db.files = db.files.filter((f) => f.id !== id); persist() },
  open_file: ({ path }) => { if (String(path).includes('missing')) throw err('FILE_NOT_FOUND', `${path} was moved or deleted`) },
  reveal_in_folder: ({ path }) => handlers.open_file({ path }),
  open_external: ({ url }) => {
    if (!/^(https?:|mailto:)/i.test(String(url).trim())) throw err('VALIDATION', 'Only http, https and mailto links can be opened')
    window.open(String(url), '_blank', 'noopener')
  },
  get_timer_state: () => timerState(),
  start_timer: ({ kind, task_id, duration_sec, long_break_every }) => {
    if (timer.phase === 'running' || timer.phase === 'paused') throw err('TIMER_BUSY', 'A session is already in progress')
    const k: SessionType = kind ?? 'work'
    const minutes = k === 'work' ? db.settings.work_min : k === 'short_break' ? db.settings.short_break_min : db.settings.long_break_min
    if (long_break_every != null && (long_break_every < 2 || long_break_every > 12)) throw err('VALIDATION', 'Sessions before a long break must be between 2 and 12')
    const task = task_id ? need(db.tasks, task_id, 'Task') : null
    Object.assign(timer, {
      phase: 'running', kind: k, task_id: task?.id ?? null, project_id: task?.project_id ?? null,
      total: (duration_sec ?? minutes * 60) * 1000, elapsed: 0, resumedAt: Date.now(), startedAt: now(),
      longEvery: long_break_every ?? db.settings.long_break_every,
    })
    startTicker(); pushState()
    return timerState()
  },
  pause_timer: () => {
    if (timer.phase !== 'running') throw err('TIMER_STATE', 'The timer is not running')
    timer.elapsed = elapsedMs(); timer.resumedAt = null; timer.phase = 'paused'; pushState()
    return timerState()
  },
  resume_timer: () => {
    if (timer.phase !== 'paused') throw err('TIMER_STATE', 'The timer is not paused')
    timer.resumedAt = Date.now(); timer.phase = 'running'; pushState()
    return timerState()
  },
  stop_timer: () => {
    if (timer.phase === 'running' || timer.phase === 'paused') {
      const sec = Math.floor(elapsedMs() / 1000)
      if (timer.kind === 'work' && sec >= 60) saveSession('work', sec)
    }
    Object.assign(timer, { phase: 'idle', resumedAt: null, elapsed: 0 }); pushState()
    return timerState()
  },
  complete_session: () => { if (timer.phase === 'completed') timer.phase = 'idle'; pushState(); return timerState() },
  get_analytics: ({ from, to }) => analytics(from, to),
  get_focus_sessions: ({ project_id, task_id, limit }) => db.sessions.filter((s) => (project_id == null || s.project_id === project_id) && (task_id == null || s.task_id === task_id)).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, limit ?? 200),
  export_data: ({ path }) => {
    const { settings, seq, ...tables } = db
    download(String(path).split(/[\\/]/).pop() || 'kairo-backup.json', JSON.stringify({ format: 'kairo-backup', version: 1, exported_at: now(), seq, settings, tables }, null, 2))
  },
  backup_database: ({ path }) => handlers.export_data({ path }),
  validate_backup: ({ path }) => {
    const raw = pendingImports.get(String(path))
    if (raw === undefined) throw err('FILE_NOT_FOUND', 'File not found')
    return validateBackup(raw).summary
  },
  import_data: ({ path }) => {
    const raw = pendingImports.get(String(path))
    if (raw === undefined) throw err('FILE_NOT_FOUND', 'File not found')
    const { data, summary } = validateBackup(raw)
    db = data; persist(); emit('data-imported')
    return summary
  },
  reset_data: () => {
    const settings = db.settings
    db = { ...empty(), settings }
    Object.assign(timer, { phase: 'idle', resumedAt: null, elapsed: 0, completedWork: 0 })
    persist()
  },
  load_demo_data: ({ lang }) => { demo(lang); persist() },
  get_app_info: (): AppInfo => ({ version: '0.1.0', data_dir: 'browser://localStorage', db_path: 'browser://localStorage/kairo', schema_version: 1 }),
  get_settings: () => ({ ...db.settings }),
  update_setting: ({ key, value }) => {
    if (!(key in DEFAULT_SETTINGS)) throw err('VALIDATION', `Unknown setting: ${key}`)
    ;(db.settings as unknown as A)[key] = value
    persist()
    return { ...db.settings }
  },
}

function applyNoteLinks(id: number, input: A): Note {
  db.note_tags = db.note_tags.filter((x) => x.note_id !== id)
  for (const t of ensureTags(input.tags ?? [])) db.note_tags.push({ note_id: id, tag_id: t })
  db.note_tasks = db.note_tasks.filter((x) => x.note_id !== id)
  for (const t of (input.task_ids ?? []) as number[]) if (db.tasks.some((x) => x.id === t)) db.note_tasks.push({ note_id: id, task_id: t })
  persist()
  return hydrateNote(need(db.notes, id, 'Note'))
}

export async function mockInvoke(cmd: string, args: Record<string, unknown>): Promise<unknown> {
  const h = handlers[cmd]
  if (!h) throw err('UNKNOWN_COMMAND', `Unknown command: ${cmd}`)
  await Promise.resolve()
  return structuredClone(h(args))
}

/** Test hook: wipes the mock database. */
export function __resetMock() {
  db = empty()
  Object.assign(timer, { phase: 'idle', resumedAt: null, elapsed: 0, completedWork: 0 })
  persist()
}
if (typeof window !== 'undefined') (window as unknown as A).__kairoMock = { reset: __resetMock }
