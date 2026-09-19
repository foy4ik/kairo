import { CheckCircle2, Info, XCircle, X } from 'lucide-react'
import { useToasts } from '@/store/toast'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'

const icons = { success: CheckCircle2, error: XCircle, info: Info }
const tone = { success: 'text-ok', error: 'text-danger', info: 'text-accent-text' }

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  const t = useT()
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2"
      role="region"
      aria-label={t('common.notifications')}
      aria-live="polite"
    >
      {toasts.map((x) => {
        const Icon = icons[x.kind]
        return (
          <div
            key={x.id}
            role={x.kind === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-sm shadow-pop animate-pop-in"
          >
            <Icon size={16} aria-hidden className={cn('mt-0.5 shrink-0', tone[x.kind])} />
            <div className="min-w-0 flex-1 break-words">{x.message}</div>
            {x.action && (
              <button
                className="shrink-0 font-medium text-accent-text hover:underline"
                onClick={() => {
                  x.action!.run()
                  dismiss(x.id)
                }}
              >
                {x.action.label}
              </button>
            )}
            <button aria-label={t('common.close')} className="shrink-0 text-muted hover:text-fg" onClick={() => dismiss(x.id)}>
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
