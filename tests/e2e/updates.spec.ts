import { expect, test, type Page } from '@playwright/test'
import { freshApp } from './helpers'

type Fake = { version?: string; notes?: string; fail?: 'check' | 'install' }
const withFakeUpdate = (page: Page, fake: Fake) =>
  page.addInitScript((f) => { (window as unknown as { __KAIRO_FAKE_UPDATE__: Fake }).__KAIRO_FAKE_UPDATE__ = f }, fake)

test.describe('Auto-update', () => {
  test('a found update is offered, never installed without consent, then downloads with progress', async ({ page }) => {
    await withFakeUpdate(page, { version: '0.2.0', notes: '## Что нового\n\n- Исправлена ошибка' })
    await freshApp(page)
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByTestId('update-check').click()

    const dialog = page.getByRole('dialog', { name: 'Доступно обновление Kairo' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('update-version')).toHaveText('Версия 0.2.0')
    await expect(dialog).toContainText('Исправлена ошибка')
    await expect(dialog).toContainText('Ваши данные хранятся отдельно')
    expect(await page.evaluate(() => (window as unknown as { __KAIRO_FAKE_UPDATE_INSTALLED__?: boolean }).__KAIRO_FAKE_UPDATE_INSTALLED__)).toBeUndefined()

    // "Later" keeps the offer available from Settings.
    await dialog.getByRole('button', { name: 'Позже' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('update-open')).toContainText('Доступна версия 0.2.0')

    await page.getByTestId('update-open').click()
    await page.getByTestId('update-install').click()
    await expect(dialog.getByText('Устанавливаем обновление')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __KAIRO_FAKE_UPDATE_INSTALLED__?: boolean }).__KAIRO_FAKE_UPDATE_INSTALLED__)).toBe(true)
    // The dialog cannot be dismissed while installing.
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()
  })

  test('already up to date says so', async ({ page }) => {
    await withFakeUpdate(page, {})
    await freshApp(page)
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByTestId('update-check').click()
    await expect(page.getByTestId('update-status')).toContainText('Установлена последняя версия')
    await expect(page.getByRole('dialog', { name: 'Доступно обновление Kairo' })).toHaveCount(0)
  })

  test('an unreachable server is reported in human language, and the app keeps working', async ({ page }) => {
    await withFakeUpdate(page, { fail: 'check' })
    await freshApp(page)
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByTestId('update-check').click()
    await expect(page.getByTestId('update-status')).toContainText('Не удалось проверить обновления')
    await expect(page.getByTestId('update-check')).toBeEnabled()
  })

  test('a failed install shows the reason and offers a retry', async ({ page }) => {
    await withFakeUpdate(page, { version: '0.2.0', fail: 'install' })
    await freshApp(page)
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByTestId('update-check').click()
    const dialog = page.getByRole('dialog', { name: 'Доступно обновление Kairo' })
    await dialog.getByTestId('update-install').click()
    await expect(dialog.getByRole('alert')).toContainText('Не удалось установить обновление')
    await expect(dialog.getByRole('alert')).toContainText('Signature verification failed')
    await expect(dialog.getByRole('button', { name: 'Повторить' })).toBeEnabled()
  })

  test('the automatic check at launch asks first, and can be switched off', async ({ page }) => {
    await page.clock.install()
    await withFakeUpdate(page, { version: '0.3.0' })
    await freshApp(page)
    await page.clock.fastForward(7000) // the check itself starts a few seconds after launch
    await expect(async () => {
      await page.clock.fastForward(300) // the fake server answers after a short (fake-clock) delay
      await expect(page.getByRole('dialog', { name: 'Доступно обновление Kairo' })).toBeVisible({ timeout: 500 })
    }).toPass()
    await page.getByRole('button', { name: 'Позже' }).click()

    // Switch the automatic check off: no dialog at the next launch.
    await page.getByRole('link', { name: 'Настройки' }).click()
    await page.getByRole('switch', { name: 'Проверять обновления при запуске' }).click()
    await expect(page.getByRole('switch', { name: 'Проверять обновления при запуске' })).toHaveAttribute('aria-checked', 'false')
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Основная навигация' }).first()).toBeVisible()
    await page.clock.fastForward(7000)
    await page.clock.fastForward(1000)
    await expect(page.getByRole('dialog', { name: 'Доступно обновление Kairo' })).toHaveCount(0)
  })
})
