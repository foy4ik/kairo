import { expect, test } from '@playwright/test'
import { createProject, freshApp, newNote, quickAddTask } from './helpers'
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
      await newNote(page, title)
      await page.getByLabel('Текст заметки').fill(body)
      await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-state', 'saved')
    }
    await page.getByLabel('Поиск по заметкам').fill('needle')
    await expect(page.getByTestId('note-list').getByRole('button')).toHaveCount(1)
    await page.getByLabel('Поиск по заметкам').fill('zzz')
    await expect(page.getByText('Ничего не найдено').first()).toBeVisible()
  })

  test('notes can be filed into folders: create one, filter by it, it survives a reload', async ({ page }) => {
    await freshApp(page)
    await page.goto('/#/notes')
    await newNote(page, 'Filed note')
    await page.getByTestId('note-folder').selectOption({ label: 'Новая папка…' })
    await page.getByRole('textbox', { name: 'Папка' }).fill('  Specs ')
    await page.getByRole('textbox', { name: 'Папка' }).press('Enter')
    await expect(page.getByTestId('note-folder')).toHaveValue('Specs') // trimmed
    await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-state', 'saved')

    await newNote(page, 'Loose note')
    await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-state', 'saved')
    await expect(page.getByTestId('note-list').getByRole('button')).toHaveCount(2)

    await page.getByTestId('note-folder-filter').selectOption('Specs')
    await expect(page.getByTestId('note-list').getByRole('button')).toHaveCount(1)
    await expect(page.getByTestId('note-list')).toContainText('Filed note')
    await expect(page.getByTestId('note-list')).toContainText('Specs')

    await page.reload()
    await expect(page.getByTestId('note-folder-filter')).toBeVisible() // the folder is stored, not UI state
    await expect(page.getByTestId('note-list').getByRole('button').filter({ hasText: 'Specs' })).toHaveCount(1)
  })

  test('switching the open note animates its pane but never resets the search box', async ({ page }) => {
    await freshApp(page)
    await page.goto('/#/notes')
    for (const [title, body] of [['Alpha', 'shared marker text'], ['Beta', 'shared marker text']]) {
      await newNote(page, title)
      await page.getByLabel('Текст заметки').fill(body)
      await expect(page.getByTestId('save-indicator')).toHaveAttribute('data-state', 'saved')
    }
    const search = page.getByLabel('Поиск по заметкам')
    await search.fill('marker')
    await expect(page.getByTestId('note-list').getByRole('button')).toHaveCount(2)

    await page.getByTestId('note-list').getByRole('button').filter({ hasText: 'Alpha' }).click()
    await expect(page.getByLabel('Название заметки')).toHaveValue('Alpha')
    await expect(page.getByTestId('note-pane')).toHaveClass(/animate-page-in/)
    await expect(search).toHaveValue('marker')

    await page.getByTestId('note-list').getByRole('button').filter({ hasText: 'Beta' }).click()
    await expect(page.getByLabel('Название заметки')).toHaveValue('Beta')
    await expect(search).toHaveValue('marker') // switching notes never clears what was typed into search
    await expect(page.getByTestId('note-list').getByRole('button')).toHaveCount(2) // the filtered list is untouched too
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
    await expect(page.getByRole('button', { name: 'Пауза Space' })).toBeVisible() // running: the idle screen shows the same 25:00
    await expect(page.getByTestId('timer-display')).toHaveText('25:00')
    await page.clock.fastForward(60_000)
    await expect(page.getByTestId('timer-display')).toHaveText('24:00')

    // Pause with Space, then resume.
    await page.keyboard.press('Space')
    await expect(page.getByRole('button', { name: 'Продолжить Space' })).toBeVisible()
    await page.clock.fastForward(120_000)
    await expect(page.getByTestId('timer-display')).toHaveText('24:00')
    await page.keyboard.press('Space')
    // Resume is asynchronous: let it land before moving the fake clock, or the jump happens while still paused.
    await expect(page.getByRole('button', { name: 'Пауза Space' })).toBeVisible()
    await page.clock.fastForward(24 * 60_000 + 1000)
    await expect(page.getByText('Сессия завершена').first()).toBeVisible()

    await expect(page.getByTestId('session-list').getByText('Deep work')).toBeVisible()
    await page.getByRole('link', { name: 'Аналитика', exact: true }).click()
    await expect(page.getByTestId('kpi-Фокус-сессий')).toHaveText('1')
    await expect(page.getByTestId('kpi-Время в фокусе')).toHaveText('25 мин')
    await page.getByRole('link', { name: 'Главная' }).click()
    await expect(page.getByTestId('stat-Время в фокусе')).toHaveText('25 мин')
  })

  test('duration and long-break cycle can be overridden for one run without touching Settings', async ({ page }) => {
    await page.clock.install()
    await freshApp(page)
    await page.goto('/#/focus')
    await page.getByTestId('focus-params-toggle').click()
    await page.getByTestId('focus-duration-input').fill('50')
    await page.getByTestId('focus-duration-input').press('Tab')
    await page.getByTestId('focus-long-every-input').fill('2')
    await page.getByTestId('focus-long-every-input').press('Tab')
    await expect(page.getByText('до длинного перерыва: 2')).toBeVisible()

    await page.getByRole('button', { name: /^Старт/ }).click()
    await expect(page.getByRole('button', { name: 'Пауза Space' })).toBeVisible() // running: the idle screen shows the same 25:00
    await expect(page.getByTestId('timer-display')).toHaveText('50:00')
    await page.clock.fastForward(50 * 60_000 + 1000)
    await expect(page.getByText('Сессия завершена').first()).toBeVisible()
    // Only the 1st of 2 work sessions has run, so a short break (not yet long) is suggested next.
    await expect(page.getByRole('button', { name: 'Начать: Короткий перерыв' })).toBeVisible()

    // A one-off override never touches the standard defaults in Settings.
    await page.getByRole('link', { name: 'Настройки' }).click()
    await expect(page.getByTestId('setting-work_min')).toHaveValue('25')
    await expect(page.getByTestId('setting-long_break_every')).toHaveValue('4')
  })

  test('stopping a session early keeps it out of history when it is shorter than a minute', async ({ page }) => {
    await page.clock.install()
    await freshApp(page)
    await page.goto('/#/focus')
    await page.getByRole('button', { name: /^Старт/ }).click()
    await expect(page.getByRole('button', { name: 'Пауза Space' })).toBeVisible() // running: the idle screen shows the same 25:00
    await page.clock.fastForward(20_000)
    await page.getByRole('button', { name: 'Стоп' }).click()
    await expect(page.getByText('Сессий сегодня нет')).toBeVisible()
  })

  test('empty analytics explains the next step', async ({ page }) => {
    await freshApp(page)
    await page.goto('/#/analytics')
    await expect(page.getByText('Пока нечего анализировать')).toBeVisible()
    await page.getByRole('radio', { name: 'Период' }).click()
    await page.getByRole('textbox', { name: 'С', exact: true }).fill('10.09.2026')
    await page.getByRole('textbox', { name: 'По', exact: true }).fill('01.09.2026') // before the start: refused, with an example
    await page.getByRole('textbox', { name: 'По', exact: true }).press('Enter')
    await expect(page.getByRole('alert')).toContainText('Введите дату в формате');
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

  test('sidebar sections transition smoothly by default, and the animation can be turned off', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Transitions')
    await expect(page.locator('#main > div.animate-page-in')).toBeVisible() // opening a project animates too

    await page.getByRole('link', { name: 'Проекты' }).click()
    await expect(page.getByRole('heading', { name: 'Проекты' })).toBeVisible()
    await expect(page.locator('#main > div.animate-page-in')).toBeVisible()
    await page.getByRole('link', { name: 'Аналитика' }).click()
    await expect(page.locator('#main > div.animate-page-in')).toBeVisible()

    await page.getByRole('link', { name: 'Настройки' }).click()
    await expect(page.getByRole('switch', { name: 'Плавное переключение вкладок' })).toHaveAttribute('aria-checked', 'true')
    await page.getByRole('switch', { name: 'Плавное переключение вкладок' }).click()
    await expect(page.getByRole('switch', { name: 'Плавное переключение вкладок' })).toHaveAttribute('aria-checked', 'false')

    await page.getByRole('link', { name: 'Проекты' }).click()
    await expect(page.getByRole('heading', { name: 'Проекты' })).toBeVisible()
    await expect(page.locator('#main > div.animate-page-in')).toHaveCount(0)

    // The choice survives a reload.
    await page.reload()
    await page.getByRole('link', { name: 'Настройки' }).click()
    await expect(page.getByRole('switch', { name: 'Плавное переключение вкладок' })).toHaveAttribute('aria-checked', 'false')
  })

  test('Ctrl+K opens the palette: create a task by keyboard only, open a project', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Palette target')
    await page.goto('/#/')
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('combobox', { name: 'Командная палитра' })).toBeFocused()
    const list = page.getByTestId('palette-list')
    await expect(list).toBeVisible()
    await page.keyboard.type('Palette')
    await expect(list.getByRole('option', { name: /Palette target/ })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Palette target' })).toBeVisible()

    await page.keyboard.press('Control+k')
    await expect(page.getByRole('combobox', { name: 'Командная палитра' })).toBeFocused()
    await page.keyboard.type('Создать задачу')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Новая задача' })).toBeVisible()
    await page.getByLabel('Название').fill('Via palette')
    await page.keyboard.press('Control+Enter')
    await expect(page.getByTestId('task-card').filter({ hasText: 'Via palette' })).toBeVisible()

    await page.keyboard.press('Control+p')
    await expect(page.getByRole('combobox', { name: 'Командная палитра' })).toBeFocused()
    await page.keyboard.type('palette')
    await expect(page.getByTestId('palette-list').getByRole('option', { name: /Via palette/ })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('palette-list')).toHaveCount(0)
  })

  test('hotkeys work on a Russian keyboard layout, and the palette field has no focus frame', async ({ page }) => {
    await freshApp(page)
    await createProject(page, 'Layout')
    await page.goto('/#/')
    // On a Russian layout the physical K key produces "л": shortcuts must follow the key, not the letter.
    const press = (key: string, code: string, ctrl = false) =>
      page.evaluate(([k, c, m]) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k as string, code: c as string, ctrlKey: m as boolean, bubbles: true, cancelable: true })), [key, code, ctrl])
    await press('л', 'KeyK', true)
    const field = page.getByRole('combobox', { name: 'Командная палитра' })
    await expect(field).toBeFocused()
    // The global keyboard-focus outline must not draw a frame around the palette input.
    expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none')
    await page.keyboard.press('Escape')
    await expect(field).toHaveCount(0)

    await press('з', 'KeyP', true) // Ctrl+P
    await expect(field).toBeFocused()
    await page.keyboard.press('Escape')

    await press('т', 'KeyN') // N
    await expect(page.getByRole('dialog', { name: 'Новая задача' })).toBeVisible()
  })

  test('the sidebar and dashboard stay usable at the minimum window size', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 640 })
    await freshApp(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    expect(overflow).toBe(false)
  })
})

test.describe('Web engine too old (e.g. Safari of an old macOS)', () => {
  test.use({ locale: 'ru-RU' })

  test('an explanation is shown instead of a blank window, and the app does not try to render', async ({ page }) => {
    // What an engine without @property / color-mix looks like to the page.
    await page.addInitScript(() => { Object.defineProperty(window.CSS, 'registerProperty', { value: undefined }) })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Kairo не может показать интерфейс' })).toBeVisible()
    await expect(page.getByText('Safari до версии 16.4')).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0) // the app itself never mounted
  })

  test('a current engine is not affected: the app starts normally', async ({ page }) => {
    await freshApp(page)
    await expect(page.getByRole('heading', { name: 'Kairo не может показать интерфейс' })).toHaveCount(0)
  })
})
