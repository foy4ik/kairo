import { normalizeError } from '@/lib/ipc'
import { t, type Key } from '@/i18n'
import { toast } from '@/store/toast'

/** Human-language message for a backend error: known codes are translated, the rest shows the raw message. */
export function errorMessage(e: unknown): string {
  const err = normalizeError(e)
  const key = `err.${err.code}` as Key
  const translated = t(key)
  if (translated === key) return err.message
  // Technical detail helps to fix a broken backup or a database problem.
  return ['INVALID_BACKUP', 'DATABASE', 'IO'].includes(err.code) ? `${translated} (${err.message})` : translated
}

/** Runs an async action; on failure shows a toast instead of throwing. Returns undefined on error. */
export async function attempt<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    toast.error(errorMessage(e))
    return undefined
  }
}
