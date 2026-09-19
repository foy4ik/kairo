import { expect, test } from '@playwright/test'
import { createProject, dragTo, freshApp, quickAddTask } from './helpers'

test.describe('Project → Task → Kanban', () => {
  test('create a project, add a task, move it to In Progress and finish it', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Alpha')
    const cols = page.getByTestId('kanban-column')
    await expect(cols).toHaveCount(3)

    await quickAddTask(page, 'Write the spec #docs')
    const card = cols.nth(0).getByTestId('task-card').filter({ hasText: 'Write the spec' })
    await expect(card).toContainText('docs')

    await dragTo(page, card, cols.nth(1).locator('div.min-h-\\[64px\\]'))
    await expect(cols.nth(1).getByTestId('task-card').filter({ hasText: 'Write the spec' })).toBeVisible()
    await expect(cols.nth(0).getByTestId('task-card')).toHaveCount(0)

    await dragTo(page, cols.nth(1).getByTestId('task-card').first(), cols.nth(2).locator('div.min-h-\\[64px\\]'))
    const done = cols.nth(2).getByTestId('task-card').filter({ hasText: 'Write the spec' })
    await expect(done).toBeVisible()
    await expect(done.locator('div').first()).toHaveClass(/line-through/)

    // Order and columns survive a reload (SQLite is the source of truth, not UI state).
    await page.reload()
    await expect(page.getByTestId('kanban-column').nth(2).getByTestId('task-card')).toHaveCount(1)
  })

  test('reordering inside a column persists', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Order')
    for (const t of ['One', 'Two', 'Three']) await quickAddTask(page, t)
    const col = page.getByTestId('kanban-column').first()
    const titles = async () => col.getByTestId('task-card').allInnerTexts().then((a) => a.map((s) => s.split('\n')[0]))
    expect(await titles()).toEqual(['One', 'Two', 'Three'])
    await dragTo(page, col.getByTestId('task-card').nth(2), col.getByTestId('task-card').nth(0), 'top')
    await expect.poll(titles).toEqual(['Three', 'One', 'Two'])
    await page.reload()
    await expect.poll(titles).toEqual(['Three', 'One', 'Two'])
  })

  test('quick-add parses tags and priority, N opens the new-task dialog, filters narrow the board', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Filters')
    await quickAddTask(page, 'Urgent bug #bug !high')
    await quickAddTask(page, 'Plain chore')
    const urgent = page.getByTestId('task-card').filter({ hasText: 'Urgent bug' })
    await expect(urgent).toContainText('bug')
    await expect(urgent).toContainText('Высокий')

    await page.keyboard.press('Escape')
    await page.keyboard.press('n')
    await expect(page.getByRole('dialog', { name: 'Новая задача' })).toBeVisible()
    await page.getByLabel('Название').fill('From hotkey')
    await page.keyboard.press('Control+Enter')
    await expect(page.getByTestId('task-card').filter({ hasText: 'From hotkey' })).toBeVisible()

    await page.getByRole('textbox', { name: 'Поиск по задачам' }).fill('chore')
    await expect(page.getByTestId('task-card')).toHaveCount(1)
    await page.getByRole('button', { name: 'Сбросить' }).click()
    await expect(page.getByTestId('task-card')).toHaveCount(3)
  })

  test('task panel: edit, checklist, deadline; Esc closes it', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Panel')
    await quickAddTask(page, 'Design the panel')
    await page.getByTestId('task-card').first().click()
    const panel = page.getByTestId('task-panel')
    await expect(panel).toBeVisible()
    await panel.getByLabel('Название').fill('Design the side panel')
    await panel.getByLabel('Название').press('Enter')
    await panel.getByLabel('Новый пункт').fill('Sketch')
    await panel.getByLabel('Новый пункт').press('Enter')
    await panel.getByLabel('Новый пункт').fill('Build')
    await panel.getByLabel('Новый пункт').press('Enter')
    await panel.getByRole('checkbox', { name: 'Sketch' }).check()
    await expect(panel.getByText('Чек-лист · 1/2')).toBeVisible()
    await panel.locator('input[type="date"]').fill('2020-01-02')
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    const card = page.getByTestId('task-card').first()
    await expect(card).toContainText('Design the side panel')
    await expect(card).toContainText('1/2')
    await expect(card).toContainText('просрочено')
  })

  test('columns can be renamed, added and deleted with tasks moved', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Columns')
    await quickAddTask(page, 'Stay')
    await page.getByRole('button', { name: 'Добавить колонку' }).click()
    await page.getByRole('textbox', { name: 'Название колонки' }).fill('Review')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('kanban-column')).toHaveCount(4)
    await page.getByTestId('kanban-column').nth(0).getByRole('button', { name: 'Действия с колонкой' }).click()
    await page.getByRole('menuitem', { name: 'Удалить колонку' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить колонку' }).click()
    await expect(page.getByTestId('kanban-column')).toHaveCount(3)
    await expect(page.getByTestId('task-card').filter({ hasText: 'Stay' })).toBeVisible()
  })
})
