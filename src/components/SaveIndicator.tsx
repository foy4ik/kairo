import { AlertCircle, Check, Loader2, Pencil } from 'lucide-react'
import { useT } from '@/i18n'
import { cn } from '@/lib/utils'

export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

/** Data state is always explicit: saved / saving / error (icon + text, not colour alone). */
export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry?: () => void }) {
  const t = useT()
  const map = {
    saved: { icon: <Check size={13} aria-hidden />, text: t('save.saved'), cls: 'text-muted' },
    dirty: { icon: <Pencil size={13} aria-hidden />, text: t('save.dirty'), cls: 'text-muted' },
    saving: { icon: <Loader2 size={13} aria-hidden className="animate-spin" />, text: t('save.saving'), cls: 'text-muted' },
    error: { icon: <AlertCircle size={13} aria-hidden />, text: t('save.error'), cls: 'text-danger' },
  }[state]
  return (
    <span role="status" data-testid="save-indicator" data-state={state} className={cn('inline-flex items-center gap-1.5 text-xs', map.cls)}>
      {map.icon}
      {map.text}
      {state === 'error' && onRetry && (
        <button onClick={onRetry} className="font-medium underline">
          {t('common.retry')}
        </button>
      )}
    </span>
  )
}
