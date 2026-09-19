import { cn } from '@/lib/utils'

export function Kbd({ children, className }: { children: string; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[11px] font-medium text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
