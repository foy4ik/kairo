// Generates the README / portfolio screenshots from the REAL desktop build (Rust backend, real SQLite, demo workspace).
// Use an isolated build so your own data is never touched:
//   npx tauri build --no-bundle --config src-tauri/tauri.soak.conf.json     (identifier app.kairo.soak)
// Run:  node scripts/screenshots.mjs [path-to-kairo.exe]
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = process.argv[2] ?? 'C:/kairo-target/release/kairo.exe'
const outDir = 'docs/screenshots'
mkdirSync(outDir, { recursive: true })
const profile = mkdtempSync(join(tmpdir(), 'kairo-shots-'))
const port = 9336
const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: join(profile, 'wv'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: 'ignore',
})

try {
  let browser
  for (let i = 0; i < 100 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`) } catch { await new Promise((r) => setTimeout(r, 200)) }
  }
  if (!browser) throw new Error('could not attach to the app')
  const page = browser.contexts()[0].pages()[0]
  const cdp = await browser.contexts()[0].newCDPSession(page)
  const ipc = (cmd, args = {}) => page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args])
  await page.waitForSelector('nav, [role="dialog"]', { timeout: 20000 })

  // A clean demo workspace in Russian, onboarding done, no update prompts.
  await ipc('reset_data')
  await ipc('load_demo_data', { lang: 'ru' })
  for (const [key, value] of [['language', 'ru'], ['onboarded', true], ['auto_update', false], ['sound', false]]) await ipc('update_setting', { key, value })

  // Fixed 1280x800 canvas at 1.5x so the images are crisp on retina README viewers.
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false })

  const load = async (theme) => {
    await ipc('update_setting', { key: 'theme', value: theme })
    await page.reload()
    await page.waitForSelector('nav')
    await page.waitForTimeout(500)
  }
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(600) }
  const shot = async (name) => { await page.screenshot({ path: `${outDir}/${name}.png` }); console.log('saved', name) }
  const projects = await ipc('get_projects')
  const launch = projects.find((p) => p.name.includes('Kairo')) ?? projects[0]

  await load('dark')
  await go('#/'); await shot('01-dashboard')

  await go(`#/projects/${launch.id}`)
  await page.getByTestId('task-card').filter({ hasText: 'фокус-таймер' }).click()
  await page.waitForTimeout(500)
  await shot('02-board')
  await page.keyboard.press('Escape')

  await go('#/notes')
  await page.getByTestId('note-list').getByRole('button').first().click()
  await page.waitForTimeout(500)
  await shot('03-notes')

  // Focus screen with a running session bound to a task.
  const tasks = await ipc('get_tasks', { project_id: null })
  const task = tasks.find((t) => t.title.includes('фокус-таймер')) ?? tasks.find((t) => !t.completed_at)
  await ipc('start_timer', { kind: 'work', task_id: task.id, duration_sec: null })
  await go('#/focus'); await page.waitForTimeout(1200)
  await shot('04-focus')
  await ipc('stop_timer')

  await go('#/analytics'); await page.waitForTimeout(600); await shot('05-analytics')

  await go('#/'); await page.keyboard.press('Control+k'); await page.waitForTimeout(500)
  await shot('09-command-palette')
  await page.keyboard.press('Escape')

  await load('light')
  await go('#/'); await shot('06-dashboard-light')
  await go(`#/projects/${launch.id}`); await shot('07-board-light')
  await go('#/settings'); await shot('08-settings')

  await ipc('reset_data')
  await browser.close()
} finally {
  app.kill()
  await new Promise((r) => setTimeout(r, 800))
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
}
