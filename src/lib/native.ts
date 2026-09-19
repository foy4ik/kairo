/* Native dialogs. Falls back to browser primitives when running outside Tauri (dev preview, E2E). */
import { isTauri } from '@/lib/ipc'

export async function pickSavePath(defaultName: string, extension: string, label: string): Promise<string | null> {
  if (isTauri()) {
    const { save } = await import('@tauri-apps/plugin-dialog')
    return save({ defaultPath: defaultName, filters: [{ name: label, extensions: [extension] }] })
  }
  return defaultName
}

/** Picks a backup file; in the browser the file content is registered with the mock backend. */
export async function pickBackupFile(label: string): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const r = await open({ multiple: false, directory: false, filters: [{ name: label, extensions: ['json'] }] })
    return typeof r === 'string' ? r : null
  }
  const { registerMockImport } = await import('@/lib/ipc/mock')
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,application/json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      const path = `mock://${f.name}`
      registerMockImport(path, await f.text())
      resolve(path)
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}

export async function pickLocalPath(directory: boolean): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const r = await open({ multiple: false, directory })
    return typeof r === 'string' ? r : null
  }
  return window.prompt(directory ? 'Folder path' : 'File path')
}
