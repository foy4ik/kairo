import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, File, FileSearch, FolderOpen, FolderPlus, Paperclip, Trash2 } from 'lucide-react'
import { Button, IconButton } from '@/components/Button'
import { EmptyState, ErrorState, Spinner } from '@/components/EmptyState'
import { useT } from '@/i18n'
import { filesRepo } from '@/lib/repositories'
import { pickLocalPath } from '@/lib/native'
import { attempt, errorMessage } from '@/lib/errors'
import { normalizeError } from '@/lib/ipc'
import { toast } from '@/store/toast'
import type { FileReference } from '@/lib/types'

/** Files linked to a project. Only paths are stored (never the content); moved files get a clear state. */
export function FilesTab({ projectId }: { projectId: number }) {
  const t = useT()
  const [files, setFiles] = useState<FileReference[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setFiles(await filesRepo.list(projectId)); setError(null) } catch (e) { setError(normalizeError(e).message) }
  }, [projectId])
  useEffect(() => { void load() }, [load])
  // Re-check existence when the window regains focus (a file may have been moved meanwhile).
  useEffect(() => {
    const on = () => void load()
    window.addEventListener('focus', on)
    return () => window.removeEventListener('focus', on)
  }, [load])

  const add = async (directory: boolean) => {
    const path = await pickLocalPath(directory)
    if (!path) return
    const f = await attempt(() => filesRepo.add(projectId, path))
    if (f) { toast.success(t('files.added')); await load() }
  }

  const run = async (fn: () => Promise<void>) => {
    try { await fn() } catch (e) { toast.error(errorMessage(e)); await load() }
  }

  if (error) return <ErrorState message={error} onRetry={() => void load()} />
  if (!files) return <div className="flex justify-center p-16"><Spinner /></div>

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col gap-4 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t('files.hint')}</p>
        <div className="flex gap-2">
          <Button onClick={() => void add(false)}><Paperclip size={14} />{t('files.addFile')}</Button>
          <Button onClick={() => void add(true)}><FolderPlus size={14} />{t('files.addFolder')}</Button>
        </div>
      </div>
      {files.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface">
          <EmptyState icon={<Paperclip size={22} />} title={t('files.emptyTitle')} description={t('files.emptyText')} />
        </div>
      ) : (
        <ul className="flex flex-col gap-2" data-testid="file-list">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
              {f.exists ? <File size={18} className="shrink-0 text-muted" aria-hidden /> : <AlertTriangle size={18} className="shrink-0 text-warn" aria-hidden />}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{f.label}</div>
                <div className="selectable truncate font-mono text-xs text-muted">{f.path}</div>
                {!f.exists && <div role="alert" className="mt-1 text-xs text-warn">{t('files.missing')}</div>}
              </div>
              <Button size="sm" disabled={!f.exists} onClick={() => void run(() => filesRepo.open(f.path))}><FileSearch size={13} />{t('files.open')}</Button>
              <Button size="sm" disabled={!f.exists} onClick={() => void run(() => filesRepo.reveal(f.path))}><FolderOpen size={13} />{t('files.reveal')}</Button>
              <IconButton label={t('files.remove')} onClick={() => void run(async () => { await filesRepo.remove(f.id); await load() })}><Trash2 size={15} /></IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
