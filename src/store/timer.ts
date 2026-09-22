import { create } from 'zustand'
import { listen } from '@/lib/ipc'
import { timerRepo } from '@/lib/repositories'
import type { SessionType, TimerState } from '@/lib/types'
import { attempt } from '@/lib/errors'
import { playChime } from '@/lib/sound'
import { toast } from '@/store/toast'
import { useSettings } from '@/store/settings'
import { useData } from '@/store/data'
import { t } from '@/i18n'

interface TimerStore {
  state: TimerState | null
  /** Bumped whenever a session is written, so history/analytics views can refetch. */
  sessionsVersion: number
  init: () => Promise<() => void>
  start: (kind: SessionType, taskId: number | null, durationSec?: number | null, longBreakEvery?: number | null) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  stop: () => Promise<void>
  dismiss: () => Promise<void>
  toggle: () => Promise<void>
}

export const useTimer = create<TimerStore>((set, get) => {
  const apply = (state: TimerState | undefined) => state && set({ state })
  return {
    state: null,
    sessionsVersion: 0,
    init: async () => {
      apply(await attempt(() => timerRepo.state()))
      const offs = await Promise.all([
        listen<TimerState>('timer-state', (s) => set({ state: s })),
        listen<{ type: SessionType; state: TimerState | null }>('timer-completed', (e) => {
          if (e.state) set({ state: e.state })
          if (useSettings.getState().settings.sound) playChime()
          toast.success(t(e.type === 'work' ? 'timer.doneWork' : 'timer.doneBreak'))
        }),
        listen<void>('sessions-changed', () => {
          set((s) => ({ sessionsVersion: s.sessionsVersion + 1 }))
          void useData.getState().refreshProjects()
        }),
      ])
      return () => offs.forEach((off) => off())
    },
    start: async (kind, taskId, durationSec = null, longBreakEvery = null) => apply(await attempt(() => timerRepo.start(kind, taskId, durationSec, longBreakEvery))),
    pause: async () => apply(await attempt(() => timerRepo.pause())),
    resume: async () => apply(await attempt(() => timerRepo.resume())),
    stop: async () => apply(await attempt(() => timerRepo.stop())),
    dismiss: async () => apply(await attempt(() => timerRepo.complete())),
    toggle: async () => {
      const s = get().state
      if (!s) return
      if (s.phase === 'running') await get().pause()
      else if (s.phase === 'paused') await get().resume()
      else await get().start(s.phase === 'completed' ? s.next_type : 'work', s.task_id)
    },
  }
})
