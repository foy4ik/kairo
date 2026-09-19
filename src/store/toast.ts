import { create } from 'zustand'

export type ToastKind = 'success' | 'error' | 'info'
export interface Toast { id: number; kind: ToastKind; message: string; action?: { label: string; run: () => void } }

interface ToastStore {
  toasts: Toast[]
  push: (kind: ToastKind, message: string, action?: Toast['action']) => void
  dismiss: (id: number) => void
}

let seq = 1
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (kind, message, action) => {
    const id = seq++
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, message, action }] }))
    setTimeout(() => get().dismiss(id), kind === 'error' ? 7000 : 3500)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}))

export const toast = {
  success: (m: string, a?: Toast['action']) => useToasts.getState().push('success', m, a),
  error: (m: string, a?: Toast['action']) => useToasts.getState().push('error', m, a),
  info: (m: string, a?: Toast['action']) => useToasts.getState().push('info', m, a),
}
