import { expect, type Page } from '@playwright/test'

/** Fresh browser profile = fresh mock database. Skips onboarding unless asked otherwise. */
export async function freshApp(page: Page, opts: { onboarded?: boolean; lang?: 'ru' | 'en'; theme?: 'light' | 'dark' | 'system' } = {}) {
  const { onboarded = true, lang = 'ru', theme = 'light' } = opts
  await page.addInitScript(
    ([o, l, th]) => {
      if (!localStorage.getItem('kairo-mock-db-v1')) {
        localStorage.setItem('kairo-mock-db-v1', JSON.stringify({
          settings: { language: l, theme: th, work_min: 25, short_break_min: 5, long_break_min: 15, long_break_every: 4, notifications: true, sound: true, onboarded: o },
        }))
      }
    },
    [onboarded, lang, theme] as const,
  )
  await page.goto('/')
  await expect(page.getByRole('navigation', { name: /Основная навигация|Main navigation/ }).first()).toBeVisible()
}

export async function createProject(page: Page, name: string) {
  await page.getByRole('link', { name: /^(Проекты|Projects)$/ }).click()
  await page.getByRole('button', { name: /Новый проект|New project/ }).first().click()
  await page.getByLabel(/^(Название|Name)$/).fill(name)
  await page.getByRole('button', { name: /^(Создать|Create)$/ }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

/** Adds a task through the inline quick-add of the first board column. */
export async function quickAddTask(page: Page, title: string, columnIndex = 0) {
  const col = page.getByTestId('kanban-column').nth(columnIndex)
  await col.getByRole('button', { name: /Добавить задачу|Add task/ }).click()
  await col.getByRole('textbox', { name: /Название|Title/ }).fill(title)
  await page.keyboard.press('Enter')
  await expect(col.getByTestId('task-card').filter({ hasText: title.replace(/\s[#!]\S+/g, '') })).toBeVisible()
}

/** Real pointer drag (dnd-kit listens to pointer events, not HTML5 drag events). */
export async function dragTo(page: Page, source: ReturnType<Page['locator']>, target: ReturnType<Page['locator']>, where: 'center' | 'top' = 'center') {
  const s = await source.boundingBox()
  const t = await target.boundingBox()
  if (!s || !t) throw new Error('drag: element not visible')
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.down()
  await page.mouse.move(s.x + s.width / 2 + 8, s.y + s.height / 2 + 8, { steps: 3 })
  const ty = where === 'top' ? t.y + 6 : t.y + t.height / 2
  await page.mouse.move(t.x + t.width / 2, ty, { steps: 12 })
  await page.mouse.move(t.x + t.width / 2, ty + 1, { steps: 2 })
  // dnd-kit resolves the drop target on render: a human always pauses a moment over it before releasing.
  await page.waitForTimeout(120)
  await page.mouse.up()
  // Let the drop animation and the save finish, as a person would before grabbing the next card.
  await page.waitForTimeout(400)
}
