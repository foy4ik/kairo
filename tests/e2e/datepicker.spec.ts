import { expect, test, type Page } from '@playwright/test'
import { createProject, freshApp, quickAddTask } from './helpers'

async function openPanel(page: Page) {
  await createProject(page, 'Dates')
  await quickAddTask(page, 'Dated task')
  await page.getByTestId('task-card').first().click()
  const panel = page.getByTestId('task-panel')
  await expect(panel).toBeVisible()
  return panel
}

/** ISO date of the given day of the current month. */
const iso = (page: Page, day: number) =>
  page.evaluate((d) => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }, day)

test.describe('Date picker (own calendar instead of the native popup)', () => {
  test('picking a day closes the calendar, sets the deadline and leaves the panel usable', async ({ page }) => {
    await freshApp(page)
    const panel = await openPanel(page)
    await panel.getByRole('button', { name: 'Выбрать дату' }).click()
    const cal = page.getByRole('dialog', { name: /Выбрать дату: Срок/ })
    await expect(cal).toBeVisible()
    await cal.locator(`[data-day="${await iso(page, 15)}"]`).click()
    // The bug this replaces: on Linux the native popup stayed open and blocked everything else.
    await expect(cal).toHaveCount(0)
    await expect(panel.getByRole('textbox', { name: 'Срок' })).toHaveValue(/^15\.\d{2}\.\d{4}$/)
    await panel.getByLabel('Новый пункт').fill('still clickable')
    await expect(panel.getByLabel('Новый пункт')).toHaveValue('still clickable')
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden()
    await expect(page.getByTestId('task-card').first()).toContainText('15')
  })

  test('Esc closes only the calendar (not the panel under it); an outside click closes it too', async ({ page }) => {
    await freshApp(page)
    const panel = await openPanel(page)
    await panel.getByRole('button', { name: 'Выбрать дату' }).click()
    const cal = page.getByRole('dialog', { name: /Выбрать дату/ })
    await expect(cal).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(cal).toHaveCount(0)
    await expect(panel).toBeVisible()

    await panel.getByRole('button', { name: 'Выбрать дату' }).click()
    await expect(cal).toBeVisible()
    await panel.getByText('Параметры').click()
    await expect(cal).toHaveCount(0)
    await expect(panel).toBeVisible()
  })

  test('keyboard: arrows move by day and week, Enter picks, PageDown changes the month', async ({ page }) => {
    await freshApp(page)
    const panel = await openPanel(page)
    await panel.getByRole('textbox', { name: 'Срок' }).fill('10.10.2026')
    await panel.getByRole('textbox', { name: 'Срок' }).press('Enter')
    await panel.getByRole('button', { name: 'Выбрать дату' }).click()
    const cal = page.getByRole('dialog', { name: /Выбрать дату/ })
    await expect(cal.locator('[data-day="2026-10-10"]')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await expect(cal.locator('[data-day="2026-10-18"]')).toBeFocused()
    await page.keyboard.press('PageDown')
    await expect(cal.locator('[data-day="2026-11-18"]')).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(cal).toHaveCount(0)
    await expect(panel.getByRole('textbox', { name: 'Срок' })).toHaveValue('18.11.2026')
  })

  test('typed dates: invalid text is explained, valid text is kept, the clear button works', async ({ page }) => {
    await freshApp(page)
    const panel = await openPanel(page)
    const field = panel.getByRole('textbox', { name: 'Срок' })
    await field.fill('31.02.2026')
    await field.press('Enter')
    await expect(panel.getByRole('alert')).toContainText('Введите дату в формате 22.09.2026')
    await field.fill('05.03.2027')
    await field.press('Enter')
    await expect(panel.getByRole('alert')).toHaveCount(0)
    await expect(field).toHaveValue('05.03.2027')

    await panel.getByRole('button', { name: 'Выбрать дату' }).click()
    await page.getByRole('dialog', { name: /Выбрать дату/ }).getByRole('button', { name: 'Очистить' }).click()
    await expect(field).toHaveValue('')
    await expect(page.getByTestId('task-card').first()).not.toContainText('2027')
  })

  test('English uses month-first dates and English month names', async ({ page }) => {
    await freshApp(page, { lang: 'en' })
    await createProject(page, 'English dates')
    await quickAddTask(page, 'Task')
    await page.getByTestId('task-card').first().click()
    const panel = page.getByTestId('task-panel')
    const field = panel.getByRole('textbox', { name: 'Deadline' })
    await field.fill('09/22/2026')
    await field.press('Enter')
    await expect(field).toHaveValue('09/22/2026')
    await panel.getByRole('button', { name: 'Pick a date' }).click()
    await expect(page.getByRole('dialog', { name: /Pick a date/ })).toContainText('September 2026')
  })

  test('the calendar works in the new-task dialog', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Dialog dates')
    await page.keyboard.press('Escape')
    await page.keyboard.press('n')
    const dialog = page.getByRole('dialog', { name: 'Новая задача' })
    await dialog.getByLabel('Название').fill('With deadline')
    await dialog.getByRole('button', { name: 'Выбрать дату' }).click()
    await page.getByRole('dialog', { name: /Выбрать дату/ }).locator(`[data-day="${await iso(page, 20)}"]`).click()
    await expect(dialog.getByRole('textbox', { name: 'Срок' })).toHaveValue(/^20\./)
    await dialog.getByLabel('Название').press('Control+Enter')
    await expect(page.getByTestId('task-card').filter({ hasText: 'With deadline' })).toContainText('20')
  })
})
