import { dueState } from '@/lib/utils'
import type { Priority, Task } from '@/lib/types'

// Most urgent first. Ties within the same due-urgency are broken by priority; anything still tied keeps its
// current relative order instead of being reshuffled.
const BUCKET_ORDER = ['overdue', 'today', 'soon', 'later', 'none'] as const
const PRIORITY_WEIGHT: Record<Priority, number> = { high: 0, medium: 1, low: 2 }

/**
 * Orders tasks by urgency: overdue, then due today, then due soon (within 3 days), then later, then no due
 * date; within each of those, high priority before medium before low.
 */
export function sortByUrgency(tasks: Task[], now = new Date()): Task[] {
  return tasks
    .map((task, i) => ({
      task,
      i,
      bucket: BUCKET_ORDER.indexOf(dueState(task.due_at, !!task.completed_at, now)),
      prio: PRIORITY_WEIGHT[task.priority],
    }))
    .sort((a, b) => a.bucket - b.bucket || a.prio - b.prio || a.i - b.i)
    .map((x) => x.task)
}

/**
 * The minimal sequence of "move this id to this absolute index" steps that turns `current` into `target`
 * (same ids, different order), simulated locally so the count and order of real move calls stays correct
 * however the permutation criss-crosses. Applying the returned steps in order, each via a primitive that
 * moves one id to an absolute index in the list, reproduces `target` exactly.
 */
export function diffOrder(current: number[], target: number[]): Array<{ id: number; index: number }> {
  const order = [...current]
  const moves: Array<{ id: number; index: number }> = []
  target.forEach((id, index) => {
    const at = order.indexOf(id)
    if (at === index) return
    order.splice(at, 1)
    order.splice(index, 0, id)
    moves.push({ id, index })
  })
  return moves
}
