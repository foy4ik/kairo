import { describe, expect, it } from 'vitest'
import { diffOrder, sortByUrgency } from './smartSort'
import type { Priority, Task } from '@/lib/types'

let nextId = 1
function task(overrides: Partial<Task> = {}): Task {
  return {
    id: nextId++, project_id: 1, column_id: 1, title: `task-${nextId}`, description: '',
    priority: 'medium', due_at: null, position: 0, completed_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    tags: [], subtasks: [], note_ids: [],
    ...overrides,
  }
}
const iso = (offsetDays: number, base = new Date('2026-09-22T12:00:00Z')) => {
  const d = new Date(base); d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}
const NOW = new Date('2026-09-22T12:00:00Z')
const prio = (p: Priority) => ({ priority: p })

describe('sortByUrgency', () => {
  it('puts overdue above today, today above soon, soon above later, later above no due date', () => {
    const overdue = task({ due_at: iso(-2) })
    const today = task({ due_at: iso(0) })
    const soon = task({ due_at: iso(2) })
    const later = task({ due_at: iso(10) })
    const none = task({ due_at: null })
    const sorted = sortByUrgency([none, later, soon, today, overdue], NOW)
    expect(sorted).toEqual([overdue, today, soon, later, none])
  })

  it('breaks ties within the same due-urgency by priority: high, then medium, then low', () => {
    const low = task({ due_at: iso(0), ...prio('low') })
    const high = task({ due_at: iso(0), ...prio('high') })
    const medium = task({ due_at: iso(0), ...prio('medium') })
    // The exact case from the request: today+high first, today+medium second.
    expect(sortByUrgency([low, medium, high], NOW)).toEqual([high, medium, low])
  })

  it('overdue always outranks today regardless of priority', () => {
    const todayHigh = task({ due_at: iso(0), ...prio('high') })
    const overdueLow = task({ due_at: iso(-1), ...prio('low') })
    expect(sortByUrgency([todayHigh, overdueLow], NOW)).toEqual([overdueLow, todayHigh])
  })

  it('keeps the original relative order for exact ties instead of reshuffling', () => {
    const a = task({ due_at: null })
    const b = task({ due_at: null })
    const c = task({ due_at: null })
    expect(sortByUrgency([a, b, c], NOW)).toEqual([a, b, c])
    expect(sortByUrgency([c, b, a], NOW)).toEqual([c, b, a])
  })

  it('a completed task never counts as overdue, even with a past due date', () => {
    const doneOverdue = task({ due_at: iso(-5), completed_at: '2026-09-20T00:00:00Z' })
    const openLater = task({ due_at: iso(10) })
    // "later" bucket for both: the completed one is not treated as urgent just because its due date passed.
    expect(sortByUrgency([doneOverdue, openLater], NOW)).toEqual([doneOverdue, openLater])
  })
})

describe('diffOrder', () => {
  it('is empty when the order already matches', () => {
    expect(diffOrder([1, 2, 3], [1, 2, 3])).toEqual([])
  })

  it('produces a sequence of absolute-index moves that reconstructs the target order', () => {
    // A case hand-verified to trip up a naive "skip when original index == target index" shortcut:
    // simulate applying each returned move (splice out, splice in) and check the end result.
    const current = [1, 2, 3, 4, 5]
    const target = [4, 2, 5, 1, 3]
    const moves = diffOrder(current, target)
    const applied = [...current]
    for (const m of moves) {
      const at = applied.indexOf(m.id)
      applied.splice(at, 1)
      applied.splice(m.index, 0, m.id)
    }
    expect(applied).toEqual(target)
  })

  it('never emits a move for an id already at its correct absolute index when the move is applied', () => {
    const moves = diffOrder([1, 2, 3, 4], [1, 3, 2, 4])
    // id 1 stays at 0 and id 4 stays at 3 throughout — only the swapped pair needs a move.
    expect(moves.map((m) => m.id)).toEqual([3])
  })
})
