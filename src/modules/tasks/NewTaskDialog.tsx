import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Field, Input, Select } from '@/components/Field'
import { useT } from '@/i18n'
import { useUi } from '@/store/ui'
import { useData } from '@/store/data'
import { projectsRepo, tasksRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'
import { toast } from '@/store/toast'
import type { Column, Priority } from '@/lib/types'
import { parseQuickAdd } from './quickAdd'

/** Global "new task" dialog (hotkey N, command palette, dashboard). */
export function NewTaskDialog() {
  const t = useT()
  const nav = useNavigate()
  const ctx = useUi((s) => s.newTask)
  const close = useUi((s) => s.closeNewTask)
  const projects = useData((s) => s.projects).filter((p) => p.status !== 'archived')
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<number | ''>('')
  const [columns, setColumns] = useState<Column[]>([])
  const [columnId, setColumnId] = useState<number | ''>('')
  const [priority, setPriority] = useState<Priority>('medium')
  const [due, setDue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!ctx) return
    setTitle(ctx.title ?? '')
    setPriority('medium')
    setDue('')
    setError('')
    setProjectId(ctx.projectId ?? projects.find((p) => p.status === 'active')?.id ?? projects[0]?.id ?? '')
    setColumnId(ctx.columnId ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx])

  useEffect(() => {
    if (projectId === '') { setColumns([]); return }
    let alive = true
    void projectsRepo.columns(projectId).then((cols) => {
      if (!alive) return
      setColumns(cols)
      setColumnId((cur) => (cols.some((c) => c.id === cur) ? cur : cols[0]?.id ?? ''))
    })
    return () => { alive = false }
  }, [projectId])

  const parsed = useMemo(() => parseQuickAdd(title), [title])

  const submit = async () => {
    if (!parsed.title) { setError(t('validation.required')); return }
    if (projectId === '' || columnId === '') return
    setBusy(true)
    const created = await attempt(() =>
      tasksRepo.create({
        project_id: projectId, column_id: columnId, title: parsed.title,
        priority: parsed.priority ?? priority, due_at: due || null, tags: parsed.tags,
      }),
    )
    setBusy(false)
    if (!created) return
    await useData.getState().refreshTasks()
    close()
    toast.success(t('task.created'), { label: t('common.open'), run: () => nav(`/projects/${created.project_id}`) })
  }

  return (
    <Modal
      open={!!ctx} title={t('task.new')} onClose={close} onSubmit={() => void submit()}
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || projects.length === 0}>{t('common.create')}</Button>
        </>
      }
    >
      {projects.length === 0 ? (
        <div className="flex flex-col items-start gap-3 text-sm text-muted">
          <p>{t('task.needProject')}</p>
          <Button variant="primary" onClick={() => { close(); useUi.getState().setProjectDialog({ mode: 'create' }) }}>{t('project.new')}</Button>
        </div>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <Field label={t('task.title')} error={error} hint={t('task.quickHint')}>
            {(id, d) => (
              <Input id={id} aria-describedby={d} invalid={!!error} value={title} placeholder={t('task.titlePlaceholder')} data-autofocus
                onChange={(e) => { setTitle(e.target.value); setError('') }} />
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('nav.projects')}>
              {(id) => (
                <Select id={id} value={projectId} onChange={(e) => setProjectId(Number(e.target.value))}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t('task.column')}>
              {(id) => (
                <Select id={id} value={columnId} onChange={(e) => setColumnId(Number(e.target.value))}>
                  {columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t('task.priority')}>
              {(id) => (
                <Select id={id} value={parsed.priority ?? priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                  {(['low', 'medium', 'high'] as Priority[]).map((p) => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                </Select>
              )}
            </Field>
            <Field label={t('task.due')}>
              {(id) => <Input id={id} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}
            </Field>
          </div>
        </form>
      )}
    </Modal>
  )
}
