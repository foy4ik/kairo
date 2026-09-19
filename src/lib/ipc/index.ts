import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { listen as tauriListen } from '@tauri-apps/api/event'
import type { AppError } from '@/lib/types'

export const isTauri = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function normalizeError(e: unknown): AppError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    const { code, message } = e as AppError
    return { code: String(code), message: String(message) }
  }
  if (typeof e === 'string') return { code: 'UNKNOWN', message: e }
  if (e instanceof Error) return { code: 'UNKNOWN', message: e.message }
  return { code: 'UNKNOWN', message: 'Unknown error' }
}

/**
 * Single entry point to the backend. In the desktop app it is a Tauri IPC call into Rust;
 * in a plain browser (dev preview, Playwright) it is served by the in-memory mock with the same contract.
 */
export async function call<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    if (isTauri()) return await tauriInvoke<T>(cmd, args)
    const { mockInvoke } = await import('./mock')
    return (await mockInvoke(cmd, args)) as T
  } catch (e) {
    throw normalizeError(e)
  }
}

export type Unlisten = () => void

/** Subscribes to backend events (`timer-state`, `timer-completed`, ...). */
export async function listen<T>(event: string, cb: (payload: T) => void): Promise<Unlisten> {
  if (isTauri()) {
    return tauriListen<T>(event, (e) => cb(e.payload))
  }
  const { mockBus } = await import('./mock')
  const handler = (e: Event) => cb((e as CustomEvent<T>).detail)
  mockBus.addEventListener(event, handler)
  return () => mockBus.removeEventListener(event, handler)
}
