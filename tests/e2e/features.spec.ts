import { expect, test } from '@playwright/test'
import { createProject, freshApp, quickAddTask } from './helpers'
import { readFileSync } from 'node:fs'

test.describe('Onboarding and demo workspace', () => {
  test('first launch shows onboarding, demo data fills every module', async ({ page }) => {
    await freshApp(page, { onboarded: false })
    await expect(page.getByRole('dialog', { name: 'Добро пожаловать в Kairo' })).toBeVisible()
    await page.getByTestId('onboarding-next').click()
    await page.getByTestId('onboarding-next').click()
    await page.getByTestId('onboarding-next').click()
    await page.getByTestId('onboarding-finish').click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/Доброе|Добрый|Доброй/)
    await expect(page.getByTestId('project-progress').getByRole('button')).toHaveCount(2)
    await expect(page.getByTestId('today-list').getByRole('button').first()).toBeVisible()

    await page.getByRole('link', { name: 'Аналитика', exact: true }).click()
    await expect(page.getByTestId('kpi-Фокус-сессий')).not.toHaveText('0')
    await page.getByRole('link', { name: 'Заметки' }).click()
    await expect(page.getByTestId('note-list').getByRole('button')).toHaveCount(2)

    await page.reload()
    await expect(page.getByRole('dialog', { name: 'Добро пожаловать в Kairo' })).toHaveCount(0)
  })

  test('onboarding without demo data leads to an empty dashboard with a next step', async ({ page }) => {
    await freshApp(page, { onboarded: false })
    await page.getByRole('button', { name: 'Пропустить введение' }).click()
    await page.getByRole('switch', { name: 'Загрузить демо-данные' }).click()
    await page.getByTestId('onboarding-finish').click()
    await expect(page.getByText('Начните с первого проекта')).toBeVisible()
  })
})

test.describe('Notes', () => {
  test('create a note, link it to a task, edit, reload: everything persists', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Notes project')
    await quickAddTask(page, 'Linked task')

    await page.getByRole('tab', { name: 'Заметки' }).click()
    await page.getByRole('button', { name: 'Новая заметка' }).first().click()
    const editor = page.getByTestId('note-editor')
    await expect(editor).toBeVisible()
    await editor.getByLabel('Название заметки').fill('Meeting notes')
    await editor.getByLabel('Текст заметки').fill('# Agenda\n\n- [ ] first\n- **bold** item')
    await expect(editor.getByTestId('note-preview').getByRole('heading', { name: 'Agenda' })).toBeVisible()
    await editor.getByLabel('Привязать задачу').selectOption({ label: 'Linked task' })
    await expect(editor.getByTestId('save-indicator')).toHaveAttribute('data-state', 'saved')

    // Toggling a checkbox in the preview edits the Markdown source.
    await editor.getByTestId('note-preview').getByRole('checkbox').first().click()
    await expect(editor.getByLabel('Текст заметки')).toHaveValue(/- \[x\] first/)
    await expect(editor.getByTestId('save-indicator')).toHaveAttribute('data-state', 'saved')

    await page.reload()
    await page.getByRole('tab', { name: 'Заметки' }).click()
    await page.getByTestId('note-list').getByRole('button', { name: /Meeting notes/ }).click()
    await expect(page.getByLabel('Текст заметки')).toHaveValue(/- \[x\] first/)

    // The link is visible from the task side too.
    await page.getByRole('tab', { name: 'Доска' }).click()
    await page.getByTestId('task-card').first().click()
    await expect(page.getByTestId('task-panel').getByRole('button', { name: /Meeting notes/ })).toBeVisible()
  })

  test('markdown preview never renders raw HTML or remote images', async ({ page }) => {
    await freshApp(page)
    await page.goto('/#/notes')
    await page.getByRole('button', { name: 'Новая заметка' }).first().click()
    await page.getByLabel('Текст заметки').fill('<script>window.__pwned=1</script><img src="https://evil.example/x.png" onerror="window.__pwned=2">\n\n![alt text](https://evil.example/y.png)')
    const preview = page.getByTestId('note-preview')
    await expect(preview).toContainText('alt text')
    await expect(preview.locator('img, script')).toHaveCount(0)
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined()
  })

  test('search finds notes by content', async ({ page }) => {
    await freshApp(page)
    await page.goto('/#/notes')
    for (const [title, body] of [['Alpha', 'needle in a haystack'], ['Beta', 'nothing here']]) {
      await page.getByRole('button', { name: 'Новая заметка' }).first().click()
      await page.getByLabel('Название заметки').fill(title)
      await page.getByLabel('Текст заметки').fill(body)
      await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-state', 'saved')
    }
    await page.getByLabel('Поиск по заметкам').fill('needle')
    await expect(page.getByTestId('note-list').getByRole('button')).toHaveCount(1)
    await page.getByLabel('Поиск по заметкам').fill('zzz')
    await expect(page.getByText('Ничего не найдено').first()).toBeVisible()
  })
})

test.describe('Focus and analytics', () => {
  test('a finished focus session on a task lands in history and analytics', async ({ page }) => {
    await page.clock.install()
    await freshApp(page)
    await createProject(page, 'Focus project')
    await quickAddTask(page, 'Deep work')
    await page.getByRole('link', { name: 'Фокус' }).click()
    await page.getByTestId('focus-task-select').selectOption({ label: 'Deep work' })
    await page.getByRole('button', { name: /^Старт/ }).click()
    await expect(page.getByTestId('timer-display')).toHaveText('25:00')
    await page.clock.fastForward(60_000)
    await expect(page.getByTestId('timer-display')).toHaveText('24:00')

    // Pause with Space, then resume.
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Продолжить Space' })).toBeVisible()
    await page.clock.fastForward(120_000)
    await expect(page.getByTestId('timer-display')).toHaveText('24:00')
    await page.keyboard.press('Space')
    await page.clock.fastForward(24 * 60_000 + 1000)
    await expect(page.getByText('Сессия завершена').first()).toBeVisible()

    await expect(page.getByTestId('session-list').getByText('Deep work')).toBeVisible()
    await page.getByRole('link', { name: 'Аналитика', exact: true }).click()
    await expect(page.getByTestId('kpi-Фокус-сессий')).toHaveText('1')
    await expect(page.getByTestId('kpi-Время в фокусе')).toHaveText('25 мин')
    await page.getByRole('link', { name: 'Главная' }).click()
    await expect(page.getByTestId('stat-Время в фокусе')).toHaveText('25 мин')
  })

  test('stopping a session early keeps it out of history when it is shorter than a minute', async ({ page }) => {
    await page.clock.install()
    await freshApp(page)
    await page.goto('/#/focus')
    await page.getByRole('button', { name: /^Старт/ }).click()
    await page.clock.fastForward(20_000)
    await page.getByRole('button', { name: 'Стоп' }).click()
    await expect(page.getByText('Сессий сегодня нет')).toBeVisible()
  })

  test('empty analytics explains the next step', async ({ page }) => {
    await freshApp(page)
    await page.goto('/#/analytics')
    await expect(page.getByText('Пока нечего анализировать')).toBeVisible()
    await page.getByRole('radio', { name: 'Период' }).click()
    await page.getByRole('textbox', { name: 'С', exact: true }).fill('2026-09-10')
    await page.getByRole('textbox', { name: 'По', exact: true }).fill('2026-09-01')
    await expect(page.getByRole('alert')).toContainText('Дата начала позже');
  })
})

test.describe('Data management', () => {
  test('export → reset → import restores the data', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Precious')
    await quickAddTask(page, 'Keep me #important')

    await page.getByRole('link', { name: 'Настройки' }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Экспорт в JSON' }).click()])
    const path = await download.path()
    const backup = JSON.parse(readFileSync(path, 'utf8'))
    expect(backup.format).toBe('kairo-backup')
    expect(backup.tables.tasks).toHaveLength(1)

    await page.getByRole('button', { name: 'Сбросить данные' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Удалить всё' }).click()
    await page.getByRole('link', { name: /^Проекты$/ }).first().click()
    await expect(page.getByText('Проектов пока нет').first()).toBeVisible()

    await page.getByRole('link', { name: 'Настройки' }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Импорт из JSON' }).click()
    await (await chooser).setFiles(path)
    await expect(page.getByRole('dialog', { name: 'Импортировать резервную копию?' })).toContainText('проектов — 1, задач — 1');
    await page.getByRole('button', { name: 'Заменить данные' }).click()

    await page.getByRole('link', { name: /^Проекты$/ }).first().click()
    await page.getByTestId('project-card').filter({ hasText: 'Precious' }).click()
    await expect(page.getByTestId('task-card').filter({ hasText: 'Keep me' })).toContainText('important')
  })

  test('an invalid backup is rejected with a clear message and nothing changes', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Untouched')
    await page.getByRole('link', { name: 'Настройки' }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Импорт из JSON' }).click()
    await (await chooser).setFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') })
    await expect(page.getByRole('alert').filter({ hasText: 'Не удалось импортировать' })).toContainText('не резервная копия Kairo')
    await page.getByRole('link', { name: /^Проекты$/ }).first().click()
    await expect(page.getByTestId('project-card').filter({ hasText: 'Untouched' })).toBeVisible()
  })
})

test.describe('Language, theme and command palette', () => {
  test('switching language and theme applies instantly without reloading', async ({ page }) => {
    await freshApp(page)
    await page.evaluate(() => { (window as unknown as { __marker: number }).__marker = 42 })
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByRole('radio', { name: 'English' }).click()
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Projects', exact: true })).toBeVisible()
    await page.getByRole('radio', { name: 'Dark' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.getByRole('radio', { name: 'Light' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(42)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  })

  test('Ctrl+K opens the palette: create a task by keyboard only, open a project', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Palette target')
    await page.goto('/#/')
    await page.keyboard.press('Control+k')
    const list = page.getByTestId('palette-list')
    await expect(list).toBeVisible()
    await page.keyboard.type('Palette')
    await expect(list.getByRole('option', { name: /Palette target/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Palette target' })).toBeVisible()

    await page.keyboard.press('Control+k')
    await page.keyboard.type('Создать задачу')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Новая задача' })).toBeVisible()
    await page.getByLabel('Название').fill('Via palette')
    await page.keyboard.press('Control+Enter')
    await expect(page.getByTestId('task-card').filter({ hasText: 'Via palette' })).toBeVisible()

    await page.keyboard.press('Control+p')
    await page.keyboard.type('palette')
    await expect(page.getByTestId('palette-list').getByRole('option', { name: /Via palette/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('palette-list')).toHaveCount(0)
  })

  test('the sidebar and dashboard stay usable at the minimum window size', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 640 })
    await freshApp(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })
})
