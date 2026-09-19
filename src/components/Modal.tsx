import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { IconButton, Button } from './Button'
import { useT } from '@/i18n'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Keeps Tab inside `root`, focuses the first field on open and restores focus on close. */
function useFocusTrap(open: boolean, root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const el = root.current
    const first =
      el?.querySelector<HTMLElement>('[data-autofocus],input,textarea,select') ?? el?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return
      const nodes = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
      if (!nodes.length) return
      const a = nodes[0]
      const b = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault()
        b.focus()
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault()
        a.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, root])
}

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  /** Called on Ctrl/Cmd+Enter. */
  onSubmit?: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
}

export function Modal({ open, title, onClose, onSubmit, children, footer, width = 'max-w-md' }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const t = useT()
  useFocusTrap(open, ref)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmit) {
        e.preventDefault()
        onSubmit()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, onSubmit])
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 pt-[12vh] animate-fade-in"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn('w-full rounded-xl border border-line bg-surface shadow-pop animate-pop-in', width)}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-[15px] font-semibold">
            {title}
          </h2>
          <IconButton label={t('common.close')} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="max-h-[65vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

export function ConfirmDialog({
  open, title, message, confirmLabel, danger = true, onConfirm, onClose,
}: {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      onSubmit={onConfirm}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm text-muted">{message}</div>
    </Modal>
  )
}

/** Right-hand detail panel: keeps the board visible behind it (no context loss). */
export function SidePanel({
  open, title, onClose, children, footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const t = useT()
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-40 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside
        role="dialog"
        aria-labelledby={titleId}
        className="absolute inset-y-0 right-0 flex w-full max-w-[460px] flex-col border-l border-line bg-surface shadow-pop animate-slide-in"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold text-muted">
            {title}
          </h2>
          <IconButton label={t('common.close')} onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
      </aside>
    </div>,
    document.body,
  )
}
