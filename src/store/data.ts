import { create } from 'zustand'
import { notesRepo, projectsRepo, tasksRepo } from '@/lib/repositories'
import type { Note, ProjectSummary, Tag, Task } from '@/lib/types'
import { attempt } from '@/lib/errors'

/** UI cache of persistent data. SQLite (behind IPC) stays the source of truth: every mutation re-reads from it. */
interface DataStore {
  projects: ProjectSummary[]
  tasks: Task[]
  tags: Tag[]
  notes: Note[]
  loaded: boolean
  error: string | null
  refresh: () => Promise<void>
  refreshProjects: () => Promise<void>
  refreshTasks: () => Promise<void>
  refreshNotes: () => Promise<void>
  upsertNote: (n: Note) => void
  upsertTask: (t: Task) => void
}

export const useData = create<DataStore>((set) => ({
  projects: [], tasks: [], tags: [], notes: [], loaded: false, error: null,
  refresh: async () => {
    try {
      const [projects, tasks, tags, notes] = await Promise.all([
        projectsRepo.list(), tasksRepo.list(), tasksRepo.tags(), notesRepo.list(),
      ])
      set({ projects, tasks, tags, notes, loaded: true, error: null })
    } catch (e) {
      set({ loaded: true, error: (e as { message?: string }).message ?? 'error' })
    }
  },
  refreshProjects: async () => {
    const projects = await attempt(() => projectsRepo.list())
    if (projects) set({ projects })
  },
  refreshTasks: async () => {
    const [tasks, tags, projects] = await Promise.all([
      attempt(() => tasksRepo.list()), attempt(() => tasksRepo.tags()), attempt(() => projectsRepo.list()),
    ])
    set((s) => ({ tasks: tasks ?? s.tasks, tags: tags ?? s.tags, projects: projects ?? s.projects }))
  },
  refreshNotes: async () => {
    const [notes, tags] = await Promise.all([attempt(() => notesRepo.list()), attempt(() => tasksRepo.tags())])
    set((s) => ({ notes: notes ?? s.notes, tags: tags ?? s.tags }))
  },
  upsertNote: (n) =>
    set((s) => ({
      notes: s.notes.some((x) => x.id === n.id)
        ? s.notes.map((x) => (x.id === n.id ? n : x)).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        : [n, ...s.notes],
    })),
  upsertTask: (t) => set((s) => ({ tasks: s.tasks.map((x) => (x.id === t.id ? t : x)) })),
}))
