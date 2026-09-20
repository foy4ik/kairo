import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Database, Download, FolderOpen, Loader2, Monitor, Moon, RefreshCw, RotateCcw, Sparkles, Sun, Upload, Volume2 } from 'lucide-react'
import { Button } from '@/components/Button'
import { Input, Segmented, Toggle } from '@/components/Field'
import { ConfirmDialog, Modal } from '@/components/Modal'
import { Kbd } from '@/components/Kbd'
import { useT, type TFn } from '@/i18n'
import { useSettings } from '@/store/settings'
import { useData } from '@/store/data'
import { useUpdater } from '@/store/updater'
import { dataRepo, filesRepo } from '@/lib/repositories'
import { pickBackupFile, pickSavePath } from '@/lib/native'
import { attempt, errorMessage } from '@/lib/errors'
import { playChime } from '@/lib/sound'
import { toast } from '@/store/toast'
import { dayKey } from '@/lib/utils'
import type { AppInfo, BackupSummary, Settings } from '@/lib/types'

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-card" aria-label={title}>
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

type NumKey = 'work_min' | 'short_break_min' | 'long_break_min' | 'long_break_every'
const LIMITS: Record<NumKey, [number, number]> = { work_min: [1, 180], short_break_min: [1, 60], long_break_min: [1, 120], long_break_every: [2, 12] }

function NumberSetting({ k, label, t }: { k: NumKey; label: string; t: TFn }) {
  const value = useSettings((s) => s.settings[k])
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState('')
  useEffect(() => setDraft(String(value)), [value])
  const [min, max] = LIMITS[k]
  const commit = () => {
    const n = Number(draft)
    if (!Number.isInteger(n) || n < min || n > max) { setError(t('settings.range', { min, max })); return }
    setError('')
    if (n !== value) void useSettings.getState().set(k, n as Settings[NumKey])
  }
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <Input type="number" inputMode="numeric" min={min} max={max} value={draft} invalid={!!error} data-testid={`setting-${k}`}
        onChange={(e) => { setDraft(e.target.value); setError('') }} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      {error && <span role="alert" className="flex items-center gap-1 font-normal text-danger"><AlertTriangle size={12} aria-hidden />{error}</span>}
    </label>
  )
}

function UpdatesCard({ version, t }: { version?: string; t: TFn }) {
  const settings = useSettings((s) => s.settings)
  const { status, info, error } = useUpdater()
  const busy = status === 'checking' || status === 'downloading' || status === 'restarting'
  return (
    <Card title={t('settings.updates')} description={t('settings.updatesHint')}>
      <Toggle label={t('settings.autoUpdate')} description={t('settings.autoUpdateHint')} checked={settings.auto_update} onChange={(v) => void useSettings.getState().set('auto_update', v)} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {status === 'available' && info ? (
          <Button variant="primary" onClick={() => useUpdater.getState().openDialog()} data-testid="update-open"><Download size={14} />{t('settings.updateAvailable', { v: info.version })}</Button>
        ) : (
          <Button onClick={() => void useUpdater.getState().check()} disabled={busy} data-testid="update-check">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t('settings.checkNow')}
          </Button>
        )}
        <span role="status" className="flex items-center gap-1.5 text-sm text-muted" data-testid="update-status">
          {status === 'checking' && t('settings.checking')}
          {status === 'uptodate' && <><CheckCircle2 size={14} className="text-ok" aria-hidden />{t('settings.upToDate', { v: version ?? '' })}</>}
          {status === 'error' && <><AlertTriangle size={14} className="text-danger" aria-hidden />{t('update.checkFailed')} {error}</>}
        </span>
      </div>
    </Card>
  )
}

export function SettingsPage() {
  const t = useT()
  const settings = useSettings((s) => s.settings)
  const set = useSettings.getState().set
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [pending, setPending] = useState<{ path: string; summary: BackupSummary } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'reset' | 'demo' | null>(null)

  useEffect(() => { void dataRepo.info().then(setInfo).catch(() => undefined) }, [])

  const exportJson = async () => {
    const path = await pickSavePath(`kairo-backup-${dayKey()}.json`, 'json', 'Kairo backup (JSON)')
    if (!path) return
    if (await attempt(async () => { await dataRepo.exportJson(path); return true })) toast.success(t('settings.exported'))
  }
  const backupDb = async () => {
    const path = await pickSavePath(`kairo-${dayKey()}.db`, 'db', 'SQLite database')
    if (!path) return
    if (await attempt(async () => { await dataRepo.backupDb(path); return true })) toast.success(t('settings.exported'))
  }
  const chooseImport = async () => {
    setImportError(null)
    const path = await pickBackupFile('Kairo backup (JSON)')
    if (!path) return
    try { setPending({ path, summary: await dataRepo.validate(path) }) } catch (e) { setImportError(errorMessage(e)) }
  }
  const runImport = async () => {
    if (!pending) return
    const path = pending.path
    setPending(null)
    if (await attempt(async () => { await dataRepo.import(path); return true })) {
      await Promise.all([useData.getState().refresh(), useSettings.getState().load()])
      toast.success(t('settings.imported'))
    }
  }
  const runReset = async () => {
    setConfirm(null)
    if (await attempt(async () => { await dataRepo.reset(); return true })) { await useData.getState().refresh(); toast.success(t('settings.resetDone')) }
  }
  const runDemo = async () => {
    setConfirm(null)
    if (await attempt(async () => { await dataRepo.loadDemo(settings.language); return true })) { await useData.getState().refresh(); toast.success(t('settings.demoLoaded')) }
  }

  const shortcuts: Array<[string, string]> = [
    ['Ctrl+K', t('shortcut.palette')], ['Ctrl+P', t('shortcut.search')], ['N', t('shortcut.newTask')],
    ['Ctrl+Enter', t('shortcut.save')], ['Esc', t('shortcut.close')], ['Space', t('shortcut.timer')],
  ]

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-5 overflow-y-auto p-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t('nav.settings')}</h1>

      <Card title={t('settings.appearance')}>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          <div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-muted">{t('settings.theme')}</span>
            <Segmented<Settings['theme']> label={t('settings.theme')} value={settings.theme} onChange={(v) => void set('theme', v)} options={[
              { value: 'light', label: t('settings.light'), icon: <Sun size={14} /> }, { value: 'dark', label: t('settings.dark'), icon: <Moon size={14} /> }, { value: 'system', label: t('settings.system'), icon: <Monitor size={14} /> },
            ]} /></div>
          <div className="flex flex-col gap-1.5"><span className="text-xs font-medium text-muted">{t('settings.language')}</span>
            <Segmented<Settings['language']> label={t('settings.language')} value={settings.language} onChange={(v) => void set('language', v)} options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} /></div>
        </div>
      </Card>

      <Card title={t('settings.timer')} description={t('settings.timerHint')}>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <NumberSetting k="work_min" label={t('settings.workMin')} t={t} />
          <NumberSetting k="short_break_min" label={t('settings.shortMin')} t={t} />
          <NumberSetting k="long_break_min" label={t('settings.longMin')} t={t} />
          <NumberSetting k="long_break_every" label={t('settings.longEvery')} t={t} />
        </div>
      </Card>

      <Card title={t('settings.notifications')}>
        <Toggle label={t('settings.notify')} description={t('settings.notifyHint')} checked={settings.notifications} onChange={(v) => void set('notifications', v)} />
        <Toggle label={t('settings.sound')} description={t('settings.soundHint')} checked={settings.sound} onChange={(v) => void set('sound', v)} />
        <Button size="sm" className="mt-2" onClick={playChime}><Volume2 size={14} />{t('settings.testSound')}</Button>
      </Card>

      <UpdatesCard version={info?.version} t={t} />

      <Card title={t('settings.data')} description={t('settings.dataHint')}>
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn" role="note">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /><span>{t('settings.exportWarning')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void exportJson()}><Download size={14} />{t('settings.exportJson')}</Button>
          <Button onClick={() => void backupDb()}><Database size={14} />{t('settings.backupDb')}</Button>
          <Button onClick={() => void chooseImport()}><Upload size={14} />{t('settings.import')}</Button>
          <Button onClick={() => setConfirm('demo')}><Sparkles size={14} />{t('settings.loadDemo')}</Button>
          <Button variant="danger" onClick={() => setConfirm('reset')}><RotateCcw size={14} />{t('settings.reset')}</Button>
        </div>
        {importError && <p role="alert" className="mt-3 flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /><span><b>{t('settings.importFailed')}</b> {importError}</span></p>}
        {info && (
          <div className="mt-4 flex items-center gap-2 text-xs text-muted">
            <span>{t('settings.dataFolder')}:</span><code className="selectable truncate rounded bg-surface-2 px-1.5 py-0.5 font-mono">{info.data_dir}</code>
            {!info.data_dir.startsWith('browser://') && <Button size="sm" variant="ghost" onClick={() => void attempt(() => filesRepo.reveal(info.db_path))}><FolderOpen size={13} />{t('files.reveal')}</Button>}
          </div>
        )}
      </Card>

      <Card title={t('settings.shortcuts')}>
        <ul className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          {shortcuts.map(([k, label]) => <li key={k} className="flex items-center justify-between text-sm"><span>{label}</span><span className="flex gap-1">{k.split('+').map((p) => <Kbd key={p}>{p}</Kbd>)}</span></li>)}
        </ul>
      </Card>

      <Card title={t('settings.about')}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">{t('settings.version')}</dt><dd data-testid="app-version">{info?.version ?? '—'}</dd>
          <dt className="text-muted">{t('settings.schema')}</dt><dd>{info?.schema_version ?? '—'}</dd>
          <dt className="text-muted">{t('settings.stack')}</dt><dd>Tauri 2 · Rust · SQLite · React · TypeScript</dd>
        </dl>
        <p className="mt-3 text-sm text-muted">{t('settings.aboutText')}</p>
      </Card>

      <Modal open={!!pending} title={t('settings.importTitle')} onClose={() => setPending(null)} onSubmit={() => void runImport()}
        footer={<><Button onClick={() => setPending(null)}>{t('common.cancel')}</Button><Button variant="danger" onClick={() => void runImport()} data-autofocus>{t('settings.importReplace')}</Button></>}>
        {pending && (
          <div className="flex flex-col gap-3 text-sm">
            <p>{t('settings.importSummary', { p: pending.summary.projects, t: pending.summary.tasks, n: pending.summary.notes, s: pending.summary.sessions })}</p>
            <p className="rounded-lg bg-warn-soft px-3 py-2 text-warn">{t('settings.importWarning')}</p>
          </div>
        )}
      </Modal>
      <ConfirmDialog open={confirm === 'reset'} title={t('settings.reset')} message={t('settings.resetMessage')} confirmLabel={t('settings.resetConfirm')} onConfirm={() => void runReset()} onClose={() => setConfirm(null)} />
      <ConfirmDialog open={confirm === 'demo'} title={t('settings.loadDemo')} message={t('settings.demoMessage')} confirmLabel={t('settings.loadDemo')} danger={false} onConfirm={() => void runDemo()} onClose={() => setConfirm(null)} />
    </div>
  )
}
