import { create } from 'zustand'

export type PaletteMode = 'commands' | 'search'
export interface NewTaskCtx { projectId?: number; columnId?: number; title?: string }
export type ProjectDialog = { mode: 'create' } | { mode: 'edit'; id: number } | null

interface UiStore {
  palette: PaletteMode | null
  taskPanelId: number | null
  newTask: NewTaskCtx | null
  projectDialog: ProjectDialog
  openPalette: (m?: PaletteMode) => void
  closePalette: () => void
  openTask: (id: number | null) => void
  openNewTask: (ctx?: NewTaskCtx) => void
  closeNewTask: () => void
  setProjectDialog: (d: ProjectDialog) => void
}

export const useUi = create<UiStore>((set) => ({
  palette: null,
  taskPanelId: null,
  newTask: null,
  projectDialog: null,
  openPalette: (m = 'commands') => set({ palette: m }),
  closePalette: () => set({ palette: null }),
  openTask: (id) => set({ taskPanelId: id }),
  openNewTask: (ctx = {}) => set({ newTask: ctx }),
  closeNewTask: () => set({ newTask: null }),
  setProjectDialog: (d) => set({ projectDialog: d }),
}))
