import { AlertTriangle, Download, RefreshCw } from 'lucide-react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Markdown } from '@/components/Markdown'
import { ProgressBar } from '@/components/Chips'
import { useT } from '@/i18n'
import { useUpdater } from '@/store/updater'
import { useTimer } from '@/store/timer'

/** Asks before anything is downloaded or installed. */
export function UpdateDialog() {
  const t = useT()
  const { status, info, progress, error, dialogOpen, install, closeDialog } = useUpdater()
  const timer = useTimer((s) => s.state)
  const busy = status === 'downloading' || status === 'restarting'
  const sessionRunning = timer?.phase === 'running' || timer?.phase === 'paused'
  const pct = progress === null ? null : Math.round(progress * 100)

  return (
    <Modal
      open={dialogOpen && !!info}
      title={t('update.title')}
      onClose={closeDialog}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={closeDialog} disabled={busy}>{t('update.later')}</Button>
          <Button variant="primary" onClick={() => void install()} disabled={busy} data-autofocus data-testid="update-install">
            {status === 'error' ? <RefreshCw size={14} /> : <Download size={14} />}
            {status === 'error' ? t('common.retry') : t('update.install')}
          </Button>
        </>
      }
    >
      {info && (
        <div className="flex flex-col gap-3 text-sm">
          <p>
            <b data-testid="update-version">{t('update.version', { v: info.version })}</b>{' '}
            <span className="text-muted">{t('update.current', { v: info.currentVersion })}</span>
          </p>
          {info.notes.trim() && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{t('update.notes')}</h3>
              <div className="max-h-48 overflow-y-auto rounded-lg bg-surface-2 px-3 py-2"><Markdown source={info.notes} /></div>
            </div>
          )}
          <p className="text-muted">{t('update.dataSafe')}</p>
          {sessionRunning && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-warn-soft px-3 py-2 text-warn">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />{t('update.timerWarning')}
            </p>
          )}
          {busy && (
            <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
              <ProgressBar value={progress ?? 0} label={t('update.downloading', { pct: pct ?? 0 })} />
              <span className="text-xs text-muted">{status === 'restarting' ? t('update.restarting') : pct === null ? t('update.downloadingUnknown') : t('update.downloading', { pct })}</span>
            </div>
          )}
          {status === 'error' && error && (
            <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-danger">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
              <span><b>{t('update.failed')}</b> {error}</span>
            </p>
          )}
        </div>
      )}
    </Modal>
  )
}
