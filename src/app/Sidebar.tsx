import { NavLink, useNavigate } from 'react-router-dom'
import { BarChart3, FileText, FolderKanban, Home, Pause, Play, Plus, Search, Settings, Timer } from 'lucide-react'
import { Kbd } from '@/components/Kbd'
import { IconButton } from '@/components/Button'
import { cn, formatMmss } from '@/lib/utils'
import { useT } from '@/i18n'
import { useData } from '@/store/data'
import { useTimer } from '@/store/timer'
import { useUi } from '@/store/ui'
import { KIND_COLOR } from '@/modules/focus/TimerRing'

const link = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] font-medium transition-colors duration-150',
    isActive ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-surface-2 hover:text-fg',
  )

export function Sidebar() {
  const t = useT()
  const nav = useNavigate()
  const projects = useData((s) => s.projects).filter((p) => p.status === 'active' || p.status === 'paused')
  const timer = useTimer((s) => s.state)
  const active = timer && (timer.phase === 'running' || timer.phase === 'paused')

  const items = [
    { to: '/', icon: Home, label: t('nav.dashboard'), end: true },
    { to: '/projects', icon: FolderKanban, label: t('nav.projects') },
    { to: '/notes', icon: FileText, label: t('nav.notes') },
    { to: '/focus', icon: Timer, label: t('nav.focus') },
    { to: '/analytics', icon: BarChart3, label: t('nav.analytics') },
  ]

  return (
    <aside className="flex w-[228px] shrink-0 flex-col border-r border-line bg-surface" aria-label={t('nav.main')}>
      <div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
        <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" width={26} height={26} className="rounded-md" draggable={false} />
        <span className="text-[15px] font-semibold tracking-tight">Kairo</span>
      </div>

      <button
        onClick={() => useUi.getState().openPalette('commands')}
        className="mx-3 mb-2 mt-1 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-[13px] text-muted transition-colors hover:border-line-strong"
        data-testid="open-palette"
      >
        <Search size={14} aria-hidden /><span className="flex-1 text-left">{t('palette.open')}</span><Kbd>Ctrl</Kbd><Kbd>K</Kbd>
      </button>

      <nav className="flex flex-col gap-0.5 px-2" aria-label={t('nav.main')}>
        {items.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end} className={link}>
            <it.icon size={16} aria-hidden />{it.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 flex items-center justify-between px-4 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('nav.projects')}</span>
        <IconButton label={t('project.new')} className="h-6 w-6" onClick={() => useUi.getState().setProjectDialog({ mode: 'create' })}><Plus size={14} /></IconButton>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-2" aria-label={t('nav.projects')}>
        {projects.length === 0 && <p className="px-2.5 py-1 text-xs text-muted">{t('sidebar.noProjects')}</p>}
        {projects.map((p) => (
          <NavLink key={p.id} to={`/projects/${p.id}`} className={link}>
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="truncate">{p.name}</span>
          </NavLink>
        ))}
      </nav>

      {active && timer && (
        <div className="mx-2 mb-2 flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2" data-testid="mini-timer">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: KIND_COLOR[timer.type], animation: timer.phase === 'running' ? 'fade-in 1s ease-in-out infinite alternate' : undefined }} />
          <button onClick={() => nav('/focus')} className="flex-1 text-left" aria-label={t('nav.focus')}>
            <div className="font-mono text-sm font-semibold tabular-nums leading-tight">{formatMmss(timer.remaining_sec)}</div>
            <div className="text-[11px] text-muted">{t(`timer.type.${timer.type}`)}</div>
          </button>
          <IconButton label={timer.phase === 'running' ? t('timer.pause') : t('timer.resume')} onClick={() => void useTimer.getState().toggle()}>
            {timer.phase === 'running' ? <Pause size={15} /> : <Play size={15} />}
          </IconButton>
        </div>
      )}

      <div className="border-t border-line p-2">
        <NavLink to="/settings" className={link}><Settings size={16} aria-hidden />{t('nav.settings')}</NavLink>
      </div>
    </aside>
  )
}
