import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/** The public web demo (GitHub Pages): same app on the in-browser backend, plus demo notices. Runs against a dev
 *  server started with VITE_WEB_DEMO=1 (see playwright.config.ts). */

async function finishOnboarding(page: import('@playwright/test').Page) {
  for (let i = 0; i < 3; i++) await page.getByTestId('onboarding-next').click()
  await page.getByTestId('onboarding-finish').click()
  await expect(page.getByTestId('demo-banner')).toBeVisible()
}

test.describe('desktop-size browser', () => {
  test.use({ locale: 'ru-RU' })

  test('the demo says where the data lives, points to the desktop app, and can be dismissed for good', async ({ page }) => {
    await page.goto('/')
    await finishOnboarding(page)
    const banner = page.getByTestId('demo-banner')
    await expect(banner).toContainText('данные хранятся только у вас в браузере')
    await expect(banner.getByRole('link', { name: 'Скачать десктопную версию' })).toHaveAttribute('href', /github\.com\/foy4ik\/kairo\/releases/)
    await expect(page.getByTestId('mobile-notice')).toHaveCount(0) // wide screens go straight to the app

    await banner.getByRole('button', { name: 'Скрыть' }).click()
    await expect(banner).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('navigation', { name: 'Основная навигация' }).first()).toBeVisible()
    await expect(page.getByTestId('demo-banner')).toHaveCount(0) // remembered in this browser
  })

  test('the demo is fully usable: data created in it survives a reload, the updater card is not offered', async ({ page }) => {
    await page.goto('/')
    await finishOnboarding(page)
    await page.getByRole('link', { name: 'Проекты' }).click()
    await page.getByRole('button', { name: /Новый проект/ }).first().click()
    await page.getByLabel(/^Название$/).fill('Visitor project')
    await page.getByRole('button', { name: /^Создать$/ }).click()
    await expect(page.getByRole('heading', { name: 'Visitor project' })).toBeVisible()
    await page.reload()
    await page.getByRole('link', { name: 'Проекты' }).click()
    await expect(page.getByTestId('project-card').filter({ hasText: 'Visitor project' })).toBeVisible()

    await page.getByRole('link', { name: 'Настройки' }).click()
    await expect(page.getByRole('heading', { name: 'Настройки', level: 1 })).toBeVisible()
    await expect(page.getByTestId('update-check')).toHaveCount(0) // there is nothing to update in a browser
  })

  test('the banner has no accessibility violations', async ({ page }) => {
    await page.goto('/')
    await finishOnboarding(page)
    const r = await new AxeBuilder({ page }).include('[data-testid="demo-banner"]').withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(r.violations.map((v) => v.id)).toEqual([])
  })
})

test.describe('phone-size browser', () => {
  test.use({ locale: 'ru-RU', viewport: { width: 390, height: 844 } })

  test('a phone first sees what the app looks like, and can still open the live demo', async ({ page }) => {
    await page.goto('/')
    const notice = page.getByTestId('mobile-notice')
    await expect(notice.getByRole('heading', { name: 'Kairo лучше всего смотреть на компьютере' })).toBeVisible()
    await expect(notice.getByRole('link', { name: 'Скачать десктопную версию' })).toBeVisible()
    await expect(notice.locator('video')).toHaveCount(1)
    await expect(notice.locator('img')).toHaveCount(4)

    await page.getByTestId('mobile-notice-open').click()
    await expect(notice).toHaveCount(0)
    await expect(page.getByTestId('demo-banner')).toContainText('Лучше открыть с компьютера') // narrow-only sentence
  })
})

test.describe('language follows the visitor', () => {
  test.use({ locale: 'en-US' })

  test('an English browser gets an English demo without touching any setting', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('dialog', { name: 'Welcome to Kairo' })).toBeVisible()
    await finishOnboarding(page)
    await expect(page.getByTestId('demo-banner')).toContainText('Browser demo: your data stays in this browser')
  })
})
