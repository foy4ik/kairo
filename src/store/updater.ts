import { create } from 'zustand'
import { checkForUpdate, updatesSupported, type UpdateHandle, type UpdateInfo } from '@/lib/updater'
import { errorMessage } from '@/lib/errors'
import { useSettings } from '@/store/settings'
import { toast } from '@/store/toast'
import { t } from '@/i18n'

export type UpdateStatus = 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'restarting' | 'error'

interface UpdaterStore {
  status: UpdateStatus
  info: UpdateInfo | null
  /** 0..1, or null while the size is unknown. */
  progress: number | null
  error: string | null
  dialogOpen: boolean
  /** `silent` = automatic background check: no toast when up to date or offline. */
  check: (opts?: { silent?: boolean }) => Promise<void>
  /** Runs at start-up when the user allows automatic checks. */
  autoCheck: () => void
  install: () => Promise<void>
  openDialog: () => void
  closeDialog: () => void
}

// The handle holds the plugin object with the pending download, so it lives outside reactive state.
let handle: UpdateHandle | null = null

export const useUpdater = create<UpdaterStore>((set, get) => ({
  status: 'idle',
  info: null,
  progress: null,
  error: null,
  dialogOpen: false,

  check: async ({ silent = false } = {}) => {
    const { status } = get()
    if (status === 'checking' || status === 'downloading' || status === 'restarting') return
    if (!updatesSupported()) {
      if (!silent) toast.info(t('update.unsupported'))
      return
    }
    set({ status: 'checking', error: null })
    try {
      const found = await checkForUpdate()
      if (found) {
        handle = found
        // Found an update: ask, never install by itself.
        set({ status: 'available', info: found.info, dialogOpen: true })
      } else {
        handle = null
        set({ status: 'uptodate', info: null })
      }
    } catch (e) {
      const message = errorMessage(e)
      set({ status: silent ? 'idle' : 'error', error: silent ? null : message })
      if (!silent) toast.error(t('update.checkFailed'))
    }
  },

  autoCheck: () => {
    if (!useSettings.getState().settings.auto_update || !updatesSupported()) return
    // Let the app finish starting first; an unreachable server must never slow it down.
    setTimeout(() => void get().check({ silent: true }), 6000)
  },

  install: async () => {
    if (!handle || get().status === 'downloading') return
    set({ status: 'downloading', progress: null, error: null })
    try {
      await handle.install((p) => set({ progress: p.total ? Math.min(1, p.downloaded / p.total) : null }))
      set({ status: 'restarting', progress: 1 })
    } catch (e) {
      set({ status: 'error', error: errorMessage(e), progress: null })
    }
  },

  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => {
    // The download cannot be interrupted safely.
    if (get().status === 'downloading' || get().status === 'restarting') return
    set({ dialogOpen: false })
  },
}))
