import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton } from './Button'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

/** Small accessible dropdown (button + menu). Closes on outside click, Esc and selection. */
export function Menu({ label, items, trigger, align = 'right' }: { label: string; items: Array<MenuItem | 'separator'>; trigger?: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const btns = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
        const i = btns.indexOf(document.activeElement as HTMLButtonElement)
        btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus()
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true) }
  }, [open])

  return (
    <div ref={root} className="relative">
      {trigger ? (
        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{trigger}</button>
      ) : (
        <IconButton label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <MoreHorizontal size={16} />
        </IconButton>
      )}
      {open && (
        <div role="menu" aria-label={label} className={cn('absolute top-full z-30 mt-1 min-w-44 rounded-lg border border-line bg-surface p-1 shadow-pop animate-pop-in', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) =>
            it === 'separator' ? (
              <div key={i} role="separator" className="my-1 h-px bg-line" />
            ) : (
              <button
                key={i} role="menuitem" type="button" disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect() }}
                className={cn('flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors focus:bg-surface-2 focus:outline-none disabled:opacity-40', it.danger ? 'text-danger hover:bg-danger-soft focus:bg-danger-soft' : 'hover:bg-surface-2')}
              >
                {it.icon}{it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
