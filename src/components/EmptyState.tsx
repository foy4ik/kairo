import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import { useT } from '@/i18n'

/** Empty states explain the next step instead of just saying "nothing here". */
export function EmptyState({
  icon, title, description, action, className,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center animate-fade-in', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-text" aria-hidden>
        {icon}
      </div>
      <div className="max-w-sm">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({ title, message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  const t = useT()
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <AlertTriangle size={22} aria-hidden />
      </div>
      <div className="max-w-md">
        <h3 className="text-[15px] font-semibold">{title ?? t('error.generic')}</h3>
        {message && <p className="mt-1 break-words text-sm text-muted">{message}</p>}
      </div>
      {onRetry && <Button onClick={onRetry}>{t('common.retry')}</Button>}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn('animate-spin text-muted', className)} size={18} />
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-surface-2', className)} />
}

export function PageLoading() {
  const t = useT()
  return (
    <div role="status" aria-label={t('common.loading')} className="flex flex-col gap-4 p-8">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}
