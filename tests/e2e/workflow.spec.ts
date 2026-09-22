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

  test('quick-add: clicking away with text creates the task, clicking away empty discards it', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Quick add blur')
    const col = page.getByTestId('kanban-column').first()

    // Empty field, click elsewhere: no task, the field just closes (unchanged behaviour).
    await col.getByRole('button', { name: 'Добавить задачу' }).click()
    await col.getByRole('textbox', { name: 'Название' }).click()
    await page.getByRole('heading', { name: 'Quick add blur' }).click()
    await expect(col.getByTestId('task-card')).toHaveCount(0)
    await expect(col.getByRole('textbox', { name: 'Название' })).toHaveCount(0)

    // Text in the field, click elsewhere: the task is created, same as pressing Enter.
    await col.getByRole('button', { name: 'Добавить задачу' }).click()
    await col.getByRole('textbox', { name: 'Название' }).fill('Created on blur #docs')
    await page.getByRole('heading', { name: 'Quick add blur' }).click()
    const card = col.getByTestId('task-card').filter({ hasText: 'Created on blur' })
    await expect(card).toBeVisible()
    await expect(card).toContainText('docs')
    await expect(col.getByRole('textbox', { name: 'Название' })).toHaveCount(0)
  })

  test('tag suggestions in the task panel are scoped to the current project and narrow as you type', async ({ page }) => {
    await freshApp(page)

    // A same-prefix tag in a different project must never be suggested.
    await createProject(page, 'Other project')
    await quickAddTask(page, 'Elsewhere')
    await page.getByTestId('task-card').first().click()
    let panel = page.getByTestId('task-panel')
    await panel.getByRole('combobox', { name: 'Добавить тег' }).fill('impossible')
    await panel.getByRole('combobox', { name: 'Добавить тег' }).press('Enter')
    await page.keyboard.press('Escape')

    await createProject(page, 'Tag project')
    await quickAddTask(page, 'Has info tag')
    await quickAddTask(page, 'Has important tag')
    const cards = page.getByTestId('task-card')

    await cards.filter({ hasText: 'Has info tag' }).click()
    panel = page.getByTestId('task-panel')
    await panel.getByRole('combobox', { name: 'Добавить тег' }).fill('info')
    await panel.getByRole('combobox', { name: 'Добавить тег' }).press('Enter')
    await page.keyboard.press('Escape')

    await cards.filter({ hasText: 'Has important tag' }).click()
    panel = page.getByTestId('task-panel')
    await panel.getByRole('combobox', { name: 'Добавить тег' }).fill('important')
    await panel.getByRole('combobox', { name: 'Добавить тег' }).press('Enter')
    await page.keyboard.press('Escape')

    // A fresh task in the same project: typing "i" offers both project tags, never the other project's "impossible".
    await quickAddTask(page, 'Fresh task')
    await cards.filter({ hasText: 'Fresh task' }).click()
    panel = page.getByTestId('task-panel')
    const tagInput = panel.getByRole('combobox', { name: 'Добавить тег' })
    await expect(tagInput).toHaveAttribute('aria-expanded', 'false')
    await tagInput.fill('i')
    await expect(panel.getByRole('option', { name: 'info' })).toBeVisible()
    await expect(panel.getByRole('option', { name: 'important' })).toBeVisible()
    await expect(panel.getByRole('option', { name: 'impossible' })).toHaveCount(0)

    // One more letter narrows it down.
    await tagInput.fill('im')
    await expect(panel.getByRole('option', { name: 'info' })).toHaveCount(0)
    await expect(panel.getByRole('option', { name: 'important' })).toBeVisible()

    // Picking the suggestion adds the tag and closes the list.
    await panel.getByRole('option', { name: 'important' }).click()
    await expect(panel.getByText('important', { exact: true })).toBeVisible()
    await expect(tagInput).toHaveValue('')
    await expect(tagInput).toHaveAttribute('aria-expanded', 'false')

    // A tag already on the task is not suggested again.
    await tagInput.fill('im')
    await expect(panel.getByRole('option', { name: 'important' })).toHaveCount(0)
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
    await panel.getByRole('textbox', { name: 'Срок' }).fill('02.01.2020')
    await panel.getByRole('textbox', { name: 'Срок' }).press('Enter')
    await expect(panel.getByRole('textbox', { name: 'Срок' })).toHaveValue('02.01.2020')
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
