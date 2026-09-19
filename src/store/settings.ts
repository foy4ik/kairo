import { create } from 'zustand'
import { settingsRepo } from '@/lib/repositories'
import { useLang } from '@/i18n'
import type { Settings } from '@/lib/types'
import { attempt } from '@/lib/errors'

const DEFAULTS: Settings = {
  language: 'ru', theme: 'system', work_min: 25, short_break_min: 5, long_break_min: 15,
  long_break_every: 4, notifications: true, sound: true, onboarded: false,
}

interface SettingsStore {
  settings: Settings
  loaded: boolean
  load: () => Promise<void>
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>
}

const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null

/** Applies theme + language to the document instantly (no reload). */
export function applyAppearance(s: Settings) {
  const dark = s.theme === 'dark' || (s.theme === 'system' && !!media?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.documentElement.lang = s.language
  useLang.getState().setLang(s.language)
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULTS,
  loaded: false,
  load: async () => {
    const s = await attempt(() => settingsRepo.get())
    const settings = s ?? DEFAULTS
    applyAppearance(settings)
    set({ settings, loaded: true })
  },
  set: async (key, value) => {
    const prev = get().settings
    const optimistic = { ...prev, [key]: value }
    applyAppearance(optimistic)
    set({ settings: optimistic })
    const saved = await attempt(() => settingsRepo.update(key, value))
    if (saved) set({ settings: saved })
    else {
      applyAppearance(prev)
      set({ settings: prev })
    }
  },
}))

// Follow the OS theme live when the user picked "system".
media?.addEventListener?.('change', () => {
  const { settings } = useSettings.getState()
  if (settings.theme === 'system') applyAppearance(settings)
})
