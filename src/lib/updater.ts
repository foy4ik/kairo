/* Auto-update bridge. In the desktop app this is tauri-plugin-updater (signed packages from GitHub Releases);
   in a plain browser (dev preview, E2E) a fake update controlled by `window.__KAIRO_FAKE_UPDATE__` is used. */
import { isTauri } from '@/lib/ipc'

export interface UpdateInfo {
  version: string
  currentVersion: string
  notes: string
}

export interface DownloadProgress {
  downloaded: number
  total: number | null
}

export interface UpdateHandle {
  info: UpdateInfo
  /** Downloads, verifies the signature, installs and restarts the app. Only ever called after the user agreed. */
  install: (onProgress: (p: DownloadProgress) => void) => Promise<void>
}

interface FakeUpdate {
  /** Omit to simulate "already up to date". */
  version?: string
  notes?: string
  /** Simulate a failure: while checking or while installing. */
  fail?: 'check' | 'install'
}

const fakeUpdate = (): FakeUpdate | undefined => (window as unknown as { __KAIRO_FAKE_UPDATE__?: FakeUpdate }).__KAIRO_FAKE_UPDATE__

/** Whether this runtime can check for updates at all (desktop build, or a test double). */
export const updatesSupported = (): boolean => isTauri() || fakeUpdate() !== undefined

export async function checkForUpdate(): Promise<UpdateHandle | null> {
  if (isTauri()) {
    const { check } = await import('@tauri-apps/plugin-updater')
    const update = await check()
    if (!update) return null
    return {
      info: { version: update.version, currentVersion: update.currentVersion, notes: update.body ?? '' },
      install: async (onProgress) => {
        let total: number | null = null
        let downloaded = 0
        await update.downloadAndInstall((e) => {
          if (e.event === 'Started') total = e.data.contentLength ?? null
          else if (e.event === 'Progress') {
            downloaded += e.data.chunkLength
            onProgress({ downloaded, total })
          }
        })
        const { relaunch } = await import('@tauri-apps/plugin-process')
        await relaunch()
      },
    }
  }

  const fake = fakeUpdate()
  if (!fake) return null
  await new Promise((r) => setTimeout(r, 150))
  if (fake.fail === 'check') throw new Error('Could not reach the update server')
  if (!fake.version) return null
  return {
    info: { version: fake.version, currentVersion: '0.1.0', notes: fake.notes ?? '' },
    install: async (onProgress) => {
      for (let i = 1; i <= 5; i++) {
        await new Promise((r) => setTimeout(r, 120))
        onProgress({ downloaded: i * 200, total: 1000 })
      }
      if (fake.fail === 'install') throw new Error('Signature verification failed')
      ;(window as unknown as { __KAIRO_FAKE_UPDATE_INSTALLED__?: boolean }).__KAIRO_FAKE_UPDATE_INSTALLED__ = true
    },
  }
}
