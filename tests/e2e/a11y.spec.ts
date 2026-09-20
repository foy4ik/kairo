import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { freshApp } from './helpers'

/** WCAG 2.1 A/AA audit (axe-core) of every screen, in both themes, on the demo workspace. */
const SCREENS: Array<[string, string]> = [
  ['dashboard', '/#/'],
  ['projects', '/#/projects'],
  ['board', '/#/projects/1'],
  ['notes', '/#/notes'],
  ['focus', '/#/focus'],
  ['analytics', '/#/analytics'],
  ['settings', '/#/settings'],
]

async function loadDemo(page: Page) {
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Загрузить демо-данные' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: 'Загрузить демо-данные' }).click()
  await expect(page.getByText('Демо-данные добавлены')).toBeVisible()
}

async function audit(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
  return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n` + v.nodes.slice(0, 4).map((n) => `    ${n.target.join(' ')}  ${n.failureSummary?.split('\n').slice(1, 2).join('') ?? ''}`).join('\n'))
}

for (const theme of ['light', 'dark'] as const) {
  test(`no WCAG AA violations, ${theme} theme`, async ({ page }) => {
    await freshApp(page, { theme })
    await loadDemo(page)
    const problems: string[] = []
    for (const [name, hash] of SCREENS) {
      await page.goto(hash)
      await page.waitForTimeout(400)
      if (name === 'board') {
        // Also audit the open side panel.
        for (const v of await audit(page)) problems.push(`[board] ${v}`)
        await page.getByTestId('task-card').first().click()
        await page.waitForTimeout(400)
        for (const v of await audit(page)) problems.push(`[task panel] ${v}`)
        await page.keyboard.press('Escape')
        continue
      }
      if (name === 'notes') {
        await page.getByTestId('note-list').getByRole('button').first().click()
        await page.waitForTimeout(400)
      }
      for (const v of await audit(page)) problems.push(`[${name}] ${v}`)
    }
    // Dialogs and the palette.
    await page.goto('/#/')
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)
    for (const v of await audit(page)) problems.push(`[palette] ${v}`)
    expect(problems.join('\n'), problems.join('\n')).toBe('')
  })
}
