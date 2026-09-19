import { useCallback, useEffect, useRef, useState } from 'react'
import type { SaveState } from '@/components/SaveIndicator'

/**
 * Debounced autosave with an explicit state machine (saved / dirty / saving / error).
 * The latest draft is always flushed on unmount, on tab hide and on window close, so an ordinary UI
 * failure or quick navigation never loses typing.
 */
export function useAutosave<T>(opts: { initial: T; serialize: (v: T) => string; save: (v: T) => Promise<void>; delay?: number }) {
  const { serialize, delay = 700 } = opts
  const [state, setState] = useState<SaveState>('saved')
  const draft = useRef(opts.initial)
  const saved = useRef(serialize(opts.initial))
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const inflight = useRef<Promise<void> | null>(null)
  const saveRef = useRef(opts.save)
  saveRef.current = opts.save

  const flush = useCallback(async (): Promise<void> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = undefined }
    if (inflight.current) await inflight.current
    const snapshot = draft.current
    const key = serialize(snapshot)
    if (key === saved.current) return
    setState('saving')
    let ok = true
    const run = (async () => {
      try {
        await saveRef.current(snapshot)
        saved.current = key
        setState(serialize(draft.current) === key ? 'saved' : 'dirty')
      } catch {
        ok = false
        setState('error')
      }
    })()
    inflight.current = run
    await run
    inflight.current = null
    // Typing continued while saving: schedule another round (but never loop on a failing save).
    if (ok && serialize(draft.current) !== saved.current) timer.current = setTimeout(() => void flush(), delay)
  }, [delay, serialize])

  const update = useCallback((next: T) => {
    draft.current = next
    setState(serialize(next) === saved.current ? 'saved' : 'dirty')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void flush(), delay)
  }, [delay, flush, serialize])

  /** Marks an externally-saved value as the new baseline (e.g. after the backend normalised it). */
  const rebase = useCallback((value: T) => { saved.current = serialize(value) }, [serialize])

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') void flush() }
    const onUnload = () => void flush()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onUnload)
      void flush()
    }
  }, [flush])

  return { state, draft, update, flush, rebase }
}
