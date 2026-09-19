import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CheckSquare, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DueBadge, PriorityBadge, TagChip } from '@/components/Chips'
import { useT } from '@/i18n'
import type { Task } from '@/lib/types'

export function cardId(id: number) { return `t-${id}` }

const prioBar = { high: 'bg-danger', medium: 'bg-warn', low: 'bg-line-strong' }

export const CardBody = memo(function CardBody({ task, done }: { task: Task; done: boolean }) {
  const t = useT()
  const doneSubs = task.subtasks.filter((s) => s.completed).length
  return (
    <>
      <span aria-hidden className={cn('absolute inset-y-2 left-0 w-[3px] rounded-r', prioBar[task.priority])} />
      <div className={cn('text-sm font-medium leading-snug', done && 'text-muted line-through decoration-1')}>{task.title}</div>
      {task.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {task.tags.slice(0, 3).map((tag) => <TagChip key={tag.id} tag={tag} />)}
          {task.tags.length > 3 && <span className="text-[11px] text-muted">+{task.tags.length - 3}</span>}
        </div>
      )}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 empty:hidden">
        {task.priority === 'high' && !done && <PriorityBadge priority="high" />}
        <DueBadge due={task.due_at} done={done} />
        {task.subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted" title={t('task.checklist')}>
            <CheckSquare size={12} aria-hidden />{doneSubs}/{task.subtasks.length}
          </span>
        )}
        {task.note_ids.length > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted" title={t('task.notes')}>
            <FileText size={12} aria-hidden />{task.note_ids.length}
          </span>
        )}
      </div>
    </>
  )
})

const cardClass =
  'relative w-full cursor-pointer rounded-lg border border-line bg-surface px-3 py-2.5 pl-3.5 text-left shadow-card transition-[border-color,box-shadow] duration-150 hover:border-line-strong'

export function TaskCard({ task, done, dragDisabled, onOpen }: { task: Task; done: boolean; dragDisabled: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cardId(task.id), disabled: dragDisabled })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-testid="task-card"
      data-task-id={task.id}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(cardClass, isDragging && 'opacity-40')}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onOpen() }
        else listeners?.onKeyDown?.(e)
      }}
    >
      <CardBody task={task} done={done} />
    </div>
  )
}

/** Ghost shown under the cursor while dragging: lifted, tilted, clearly "in hand". */
export function CardOverlay({ task, done }: { task: Task; done: boolean }) {
  return (
    <div className={cn(cardClass, 'rotate-[1.5deg] cursor-grabbing border-accent shadow-pop')}>
      <CardBody task={task} done={done} />
    </div>
  )
}
