// Generates the README / portfolio screenshots from the demo workspace (browser build, in-memory backend).
// Usage: npm run dev (in another terminal), then: node scripts/screenshots.mjs
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:1420'
mkdirSync('docs/screenshots', { recursive: true })
const browser = await chromium.launch({ channel: 'msedge' })

async function session(theme, lang) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5, colorScheme: theme })
  const page = await ctx.newPage()
  await page.addInitScript(([th, l]) => localStorage.setItem('kairo-mock-db-v1', JSON.stringify({ settings: { language: l, theme: th, work_min: 25, short_break_min: 5, long_break_min: 15, long_break_every: 4, notifications: true, sound: true, onboarded: true } })), [theme, lang])
  await page.goto(base)
  await page.waitForSelector('nav')
  return page
}
async function loadDemo(page, lang) {
  await page.goto(`${base}/#/settings`)
  await page.getByRole('button', { name: lang === 'ru' ? 'Загрузить демо-данные' : 'Load demo data' }).first().click()
  await page.getByRole('dialog').getByRole('button', { name: lang === 'ru' ? 'Загрузить демо-данные' : 'Load demo data' }).click()
  await page.waitForTimeout(600)
}

const shots = [
  ['01-dashboard', '/#/', 'dark'],
  ['02-board', '/#/projects/1', 'dark'],
  ['03-notes', '/#/notes', 'dark'],
  ['04-focus', '/#/focus', 'dark'],
  ['05-analytics', '/#/analytics', 'dark'],
  ['06-dashboard-light', '/#/', 'light'],
  ['07-board-light', '/#/projects/1', 'light'],
  ['08-settings', '/#/settings', 'light'],
]
for (const theme of ['dark', 'light']) {
  const page = await session(theme, 'ru')
  await loadDemo(page, 'ru')
  for (const [name, hash, t] of shots.filter((s) => s[2] === theme)) {
    await page.goto(base + hash)
    await page.waitForTimeout(500)
    if (name === '02-board' || name === '07-board-light') {
      await page.getByTestId('task-card').filter({ hasText: 'фокус-таймер' }).click()
      await page.waitForTimeout(400)
    }
    if (name === '03-notes') {
      await page.getByTestId('note-list').getByRole('button').first().click()
      await page.waitForTimeout(400)
    }
    await page.screenshot({ path: `docs/screenshots/${name}.png` })
    await page.keyboard.press('Escape') // close the task panel before the next screen
  }
  if (theme === 'dark') {
    await page.goto(base + '/#/')
    await page.keyboard.press('Control+k')
    await page.waitForTimeout(300)
    await page.screenshot({ path: 'docs/screenshots/09-command-palette.png' })
  }
  await page.context().close()
}
await browser.close()
console.log('screenshots saved to docs/screenshots')
