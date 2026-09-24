import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3, CornerDownLeft, FilePlus2, FileText, FolderKanban, FolderPlus, Home, Languages, ListChecks, ListPlus, Moon, Search, Settings, Timer,
} from 'lucide-react'
import { Kbd } from '@/components/Kbd'
import { ProjectIcon } from '@/components/Icon'
import { cn, debounce } from '@/lib/utils'
import { useT } from '@/i18n'
import { useUi } from '@/store/ui'
import { useData } from '@/store/data'
import { useSettings } from '@/store/settings'
import { notesRepo, tasksRepo } from '@/lib/repositories'
import type { SearchResults } from '@/lib/types'
import { attempt } from '@/lib/errors'

interface Item { id: string; group: string; label: string; hint?: string; icon: ReactNode; run: () => void }

const EMPTY: SearchResults = { projects: [], tasks: [], notes: [] }

/** Ctrl+K: actions + open project + global search. Ctrl+P: quick open (search only). Fully keyboard driven. */
export function CommandPalette() {
  const t = useT()
  const nav = useNavigate()
  const loc = useLocation()
  const mode = useUi((s) => s.palette)
  const close = useUi((s) => s.closePalette)
  const projects = useData((s) => s.projects)
  const notes = useData((s) => s.notes)
  const settings = useSettings((s) => s.settings)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResults>(EMPTY)
  const [searching, setSearching] = useState(false)
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => { if (mode) { setQuery(''); setResults(EMPTY); setActive(0); setTimeout(() => input.current?.focus(), 0) } }, [mode])

  useEffect(() => {
    const q = query.trim()
    if (!mode || !q) { setResults(EMPTY); setSearching(false); return }
    setSearching(true)
    let stale = false // a search that finishes after the query changed must not overwrite newer results
    const run = debounce(async () => {
      const [r, n] = await Promise.all([attempt(() => tasksRepo.search(q)), attempt(() => notesRepo.search(q))])
      if (stale) return
      setResults({ ...(r ?? EMPTY), notes: (n ?? r?.notes ?? []).slice(0, 8) })
      setSearching(false)
    }, 120)
    run()
    return () => { stale = true; run.cancel() }
  }, [query, mode])

  const go = (path: string) => () => { close(); nav(path) }
  const projectMatch = loc.pathname.match(/^\/projects\/(\d+)/)

  const items: Item[] = useMemo(() => {
    if (!mode) return []
    const q = query.trim().toLowerCase()
    const match = (s: string) => !q || s.toLowerCase().includes(q)
    const out: Item[] = []
    if (mode === 'commands') {
      const cmds: Item[] = [
        { id: 'new-task', group: t('palette.actions'), label: t('palette.newTask'), hint: 'N', icon: <ListPlus size={16} />, run: () => { close(); useUi.getState().openNewTask({ projectId: projectMatch ? Number(projectMatch[1]) : undefined }) } },
        { id: 'new-note', group: t('palette.actions'), label: t('palette.newNote'), icon: <FilePlus2 size={16} />, run: async () => { close(); const n = await attempt(() => notesRepo.create({ title: t('note.untitled'), content: '', folder: '', project_id: projectMatch ? Number(projectMatch[1]) : null, tags: [], task_ids: [] })); if (n) { await useData.getState().refreshNotes(); nav(`/notes/${n.id}`) } } },
        { id: 'new-project', group: t('palette.actions'), label: t('palette.newProject'), icon: <FolderPlus size={16} />, run: () => { close(); useUi.getState().setProjectDialog({ mode: 'create' }) } },
        { id: 'focus', group: t('palette.actions'), label: t('palette.startFocus'), icon: <Timer size={16} />, run: go('/focus') },
        { id: 'search', group: t('palette.actions'), label: t('palette.search'), hint: 'Ctrl+P', icon: <Search size={16} />, run: () => useUi.getState().openPalette('search') },
        { id: 'go-home', group: t('palette.go'), label: t('nav.dashboard'), hint: 'Ctrl+1', icon: <Home size={16} />, run: go('/') },
        { id: 'go-projects', group: t('palette.go'), label: t('nav.projects'), hint: 'Ctrl+2', icon: <FolderKanban size={16} />, run: go('/projects') },
        { id: 'go-notes', group: t('palette.go'), label: t('nav.notes'), hint: 'Ctrl+3', icon: <FileText size={16} />, run: go('/notes') },
        { id: 'go-focus', group: t('palette.go'), label: t('nav.focus'), hint: 'Ctrl+4', icon: <Timer size={16} />, run: go('/focus') },
        { id: 'go-analytics', group: t('palette.go'), label: t('nav.analytics'), hint: 'Ctrl+5', icon: <BarChart3 size={16} />, run: go('/analytics') },
        { id: 'go-settings', group: t('palette.go'), label: t('palette.settings'), hint: 'Ctrl+6', icon: <Settings size={16} />, run: go('/settings') },
        { id: 'theme', group: t('palette.settingsGroup'), label: t('palette.toggleTheme'), icon: <Moon size={16} />, run: () => { close(); void useSettings.getState().set('theme', document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark') } },
        { id: 'lang', group: t('palette.settingsGroup'), label: t('palette.toggleLanguage'), icon: <Languages size={16} />, run: () => { close(); void useSettings.getState().set('language', settings.language === 'ru' ? 'en' : 'ru') } },
      ]
      out.push(...cmds.filter((c) => match(c.label)))
    }
    // Projects: always openable by name ("open project").
    const pList = q ? results.projects : projects.filter((p) => p.status !== 'archived').slice(0, mode === 'search' ? 6 : 5)
    const seen = new Set<number>()
    for (const p of [...pList, ...projects.filter((p) => q && match(p.name))]) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      out.push({ id: `p-${p.id}`, group: t('palette.projects'), label: p.name, icon: <ProjectIcon icon={p.icon} color={p.color} size={20} />, hint: t(`status.${p.status}`), run: go(`/projects/${p.id}`) })
    }
    if (q) {
      for (const task of results.tasks) out.push({ id: `t-${task.id}`, group: t('palette.tasks'), label: task.title, hint: projects.find((p) => p.id === task.project_id)?.name, icon: <ListChecks size={16} />, run: () => { close(); nav(`/projects/${task.project_id}`); useUi.getState().openTask(task.id) } })
      for (const n of results.notes) out.push({ id: `n-${n.id}`, group: t('palette.notes'), label: n.title, icon: <FileText size={16} />, run: go(`/notes/${n.id}`) })
    } else if (mode === 'search') {
      for (const n of notes.slice(0, 5)) out.push({ id: `n-${n.id}`, group: t('palette.notes'), label: n.title, icon: <FileText size={16} />, run: go(`/notes/${n.id}`) })
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, query, results, projects, notes, settings.language, t, loc.pathname])

  useEffect(() => { setActive(0) }, [query, mode])
  useEffect(() => { list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active])

  if (!mode) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (items.length ? (a + 1) % items.length : 0)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') e.preventDefault()
  }

  let lastGroup = ''
  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-start justify-center bg-black/40 px-4 pt-[14vh] animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && close()} onKeyDown={onKeyDown}>
      <div role="dialog" aria-modal="true" aria-label={t('palette.title')} className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop animate-pop-in">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <Search size={16} className="text-muted" aria-hidden />
          <input
            ref={input} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} role="combobox" aria-expanded aria-controls="palette-list" aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            aria-label={t('palette.title')} placeholder={mode === 'search' ? t('palette.searchPlaceholder') : t('palette.placeholder')}
            className="h-12 flex-1 bg-transparent text-[15px] text-fg placeholder:text-muted focus:outline-none"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="palette-list" ref={list} role="listbox" className="max-h-[52vh] overflow-y-auto p-2" data-testid="palette-list">
          {items.map((it, i) => {
            const header = it.group !== lastGroup
            lastGroup = it.group
            return (
              <li key={it.id} role="presentation">
                {header && <div className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{it.group}</div>}
                <button
                  id={`palette-${it.id}`} data-index={i} role="option" aria-selected={i === active} onMouseMove={() => setActive(i)} onClick={it.run}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm', i === active ? 'bg-accent-soft text-fg' : 'text-fg')}
                >
                  <span className="text-muted" aria-hidden>{it.icon}</span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="text-xs text-muted">{it.hint.includes('+') || it.hint.length === 1 ? <Kbd>{it.hint}</Kbd> : it.hint}</span>}
                  {i === active && <CornerDownLeft size={13} className="text-muted" aria-hidden />}
                </button>
              </li>
            )
          })}
          {items.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted" role="presentation">
              {searching ? t('common.loading') : query ? t('search.noResultsFor', { q: query }) : t('search.noResults')}
            </li>
          )}
        </ul>
        <div className="flex items-center gap-4 border-t border-line bg-surface-2 px-4 py-2 text-xs text-muted">
          <span className="flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>{t('palette.navigate')}</span>
          <span className="flex items-center gap-1"><Kbd>Enter</Kbd>{t('palette.select')}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
