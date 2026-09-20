import { useEffect } from 'react'
import { HashRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { CommandPalette } from './CommandPalette'
import { ErrorBoundary } from './ErrorBoundary'
import { useHotkeys } from './useHotkeys'
import { Toaster } from '@/components/Toaster'
import { Button } from '@/components/Button'
import { EmptyState, ErrorState, PageLoading } from '@/components/EmptyState'
import { DashboardPage } from '@/modules/dashboard/DashboardPage'
import { Onboarding } from '@/modules/dashboard/Onboarding'
import { ProjectsPage } from '@/modules/projects/ProjectsPage'
import { ProjectPage } from '@/modules/projects/ProjectPage'
import { ProjectDialog } from '@/modules/projects/ProjectDialog'
import { NotesPage } from '@/modules/notes/NotesPage'
import { FocusPage } from '@/modules/focus/FocusPage'
import { AnalyticsPage } from '@/modules/analytics/AnalyticsPage'
import { SettingsPage } from '@/modules/settings/SettingsPage'
import { NewTaskDialog } from '@/modules/tasks/NewTaskDialog'
import { TaskPanel } from '@/modules/tasks/TaskPanel'
import { useSettings } from '@/store/settings'
import { useData } from '@/store/data'
import { useTimer } from '@/store/timer'
import { useUpdater } from '@/store/updater'
import { UpdateDialog } from './UpdateDialog'
import { listen, isTauri } from '@/lib/ipc'
import { useT } from '@/i18n'
import { toast } from '@/store/toast'
import { errorMessage } from '@/lib/errors'

function NotFound() {
  const t = useT()
  const nav = useNavigate()
  return <EmptyState className="h-full" icon={<Compass size={22} />} title={t('notfound.title')} description={t('notfound.text')} action={<Button variant="primary" onClick={() => nav('/')}>{t('nav.dashboard')}</Button>} />
}

function Shell() {
  const t = useT()
  const loc = useLocation()
  const settingsLoaded = useSettings((s) => s.loaded)
  const onboarded = useSettings((s) => s.settings.onboarded)
  const { loaded, error } = useData()
  useHotkeys()

  useEffect(() => {
    void useSettings.getState().load().then(() => useUpdater.getState().autoCheck())
    void useData.getState().refresh()
    let off: (() => void) | undefined
    let offErr: (() => void) | undefined
    let offImp: (() => void) | undefined
    void useTimer.getState().init().then((o) => { off = o })
    void listen<{ code: string; message: string }>('app-error', (e) => toast.error(errorMessage(e))).then((o) => { offErr = o })
    void listen<void>('data-imported', () => { void useData.getState().refresh(); void useSettings.getState().load() }).then((o) => { offImp = o })
    // Desktop: the window starts hidden and is shown once the first frame is ready (no white flash).
    if (isTauri()) void import('@tauri-apps/api/window').then(({ getCurrentWindow }) => requestAnimationFrame(() => void getCurrentWindow().show()))
    return () => { off?.(); offErr?.(); offImp?.() }
  }, [])

  if (!settingsLoaded || (!loaded && !error)) return <PageLoading />
  if (error) return <ErrorState title={t('error.database')} message={error} onRetry={() => void useData.getState().refresh()} />

  return (
    <>
      <div className="flex h-full">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden" id="main">
          <ErrorBoundary resetKey={loc.pathname}>
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id" element={<ProjectPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/notes/:id" element={<NotesPage />} />
              <Route path="/focus" element={<FocusPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
        </main>
      </div>
      <TaskPanel />
      <NewTaskDialog />
      <ProjectDialog />
      <CommandPalette />
      <UpdateDialog />
      {!onboarded && <Onboarding />}
      <Toaster />
    </>
  )
}

export function App() {
  return (
    <HashRouter>
      <Shell />
    </HashRouter>
  )
}
