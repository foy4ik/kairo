import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useUi } from '@/store/ui'
import { useTimer } from '@/store/timer'

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}
const isInteractive = (el: EventTarget | null) => isEditable(el) || (el instanceof HTMLElement && !!el.closest('button,a,[role="button"],[role="tab"],[role="menuitem"],[role="option"],[role="radio"],[role="switch"]'))
const modalOpen = () => !!document.querySelector('[role="dialog"][aria-modal="true"]')

const NAV = ['/', '/projects', '/notes', '/focus', '/analytics', '/settings']

/** Global keyboard shortcuts. Single-key shortcuts never fire while typing or inside dialogs. */
export function useHotkeys() {
  const nav = useNavigate()
  const loc = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const ui = useUi.getState()

      if (mod && key === 'k') { e.preventDefault(); ui.palette ? ui.closePalette() : ui.openPalette('commands'); return }
      if (mod && key === 'p') { e.preventDefault(); ui.openPalette('search'); return }
      if (mod && /^[1-6]$/.test(e.key)) { e.preventDefault(); nav(NAV[Number(e.key) - 1]); return }
      if (mod || e.altKey || e.repeat) return
      if (ui.palette || modalOpen() || isEditable(e.target)) return

      if (key === 'n') {
        e.preventDefault()
        const m = loc.pathname.match(/^\/projects\/(\d+)/)
        ui.openNewTask({ projectId: m ? Number(m[1]) : undefined })
      } else if (e.key === ' ' && !isInteractive(e.target)) {
        const s = useTimer.getState().state
        if (s && (s.phase === 'running' || s.phase === 'paused')) { e.preventDefault(); void useTimer.getState().toggle() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [nav, loc.pathname])
}
