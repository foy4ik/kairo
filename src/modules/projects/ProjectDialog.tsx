import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Field, Input, Select, Textarea } from '@/components/Field'
import { PROJECT_COLORS, PROJECT_ICONS } from '@/components/Icon'
import { useT } from '@/i18n'
import { useUi } from '@/store/ui'
import { useData } from '@/store/data'
import { projectsRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'
import { toast } from '@/store/toast'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/lib/types'

const schema = z.object({
  name: z.string().trim().min(1, 'required').max(120),
  description: z.string().max(2000),
  status: z.enum(['active', 'paused', 'completed', 'archived']),
  color: z.string(),
  icon: z.string(),
})
type Values = z.infer<typeof schema>

/** Create / edit project. Validation by Zod through React Hook Form; the backend validates again. */
export function ProjectDialog() {
  const t = useT()
  const nav = useNavigate()
  const dialog = useUi((s) => s.projectDialog)
  const close = () => useUi.getState().setProjectDialog(null)
  const projects = useData((s) => s.projects)
  const editing = dialog?.mode === 'edit' ? projects.find((p) => p.id === dialog.id) : undefined

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', status: 'active', color: PROJECT_COLORS[0], icon: 'folder' },
  })

  useEffect(() => {
    if (!dialog) return
    reset(
      editing
        ? { name: editing.name, description: editing.description, status: editing.status, color: editing.color, icon: editing.icon }
        : { name: '', description: '', status: 'active', color: PROJECT_COLORS[0], icon: 'folder' },
    )
  }, [dialog, editing, reset])

  const color = watch('color')
  const icon = watch('icon')

  const submit = handleSubmit(async (v) => {
    if (editing) {
      const ok = await attempt(() => projectsRepo.update(editing.id, v))
      if (!ok) return
      toast.success(t('project.saved'))
    } else {
      const created = await attempt(() =>
        projectsRepo.create({ ...v, columns: [t('column.backlog'), t('column.inProgress'), t('column.done')] }),
      )
      if (!created) return
      toast.success(t('project.created'))
      close()
      await useData.getState().refresh()
      nav(`/projects/${created.id}`)
      return
    }
    close()
    await useData.getState().refresh()
  })

  return (
    <Modal
      open={!!dialog}
      title={editing ? t('project.edit') : t('project.new')}
      onClose={close}
      onSubmit={() => void submit()}
      footer={
        <>
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={() => void submit()} disabled={isSubmitting}>
            {editing ? t('common.save') : t('common.create')}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit() }} className="flex flex-col gap-3">
        <Field label={t('project.name')} error={errors.name ? t('validation.required') : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.name} placeholder={t('project.namePlaceholder')} {...register('name')} />}
        </Field>
        <Field label={t('project.description')}>
          {(id) => <Textarea id={id} rows={3} {...register('description')} />}
        </Field>
        <Field label={t('project.status')}>
          {(id) => (
            <Select id={id} {...register('status')}>
              {(['active', 'paused', 'completed', 'archived'] as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>{t(`status.${s}`)}</option>
              ))}
            </Select>
          )}
        </Field>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t('project.color')}</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('project.color')}>
            {PROJECT_COLORS.map((c) => (
              <button
                key={c} type="button" role="radio" aria-checked={color === c} aria-label={c}
                onClick={() => setValue('color', c)}
                className={cn('h-6 w-6 rounded-full ring-offset-2 ring-offset-surface transition', color === c && 'ring-2 ring-fg')}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">{t('project.icon')}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('project.icon')}>
            {Object.entries(PROJECT_ICONS).map(([key, Cmp]) => (
              <button
                key={key} type="button" role="radio" aria-checked={icon === key} aria-label={key}
                onClick={() => setValue('icon', key)}
                className={cn('flex h-8 w-8 items-center justify-center rounded-md border transition-colors', icon === key ? 'border-accent bg-accent-soft text-accent-text' : 'border-line text-muted hover:bg-surface-2')}
              >
                <Cmp size={16} />
              </button>
            ))}
          </div>
        </div>
      </form>
    </Modal>
  )
}
