// Smoke test of the REAL desktop build: drives the WebView2 UI over CDP and calls the Rust commands through Tauri IPC.
// Usage (after `tauri build`):  node scripts/native-smoke.mjs [path-to-kairo.exe]
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = process.argv[2] ?? 'C:/kairo-target/release/kairo.exe'
// The app has no data-dir override, and this test resets the database: never run it against real user data.
const appData = join(process.env.APPDATA ?? '', 'app.kairo.desktop')
if (existsSync(join(appData, 'kairo.db'))) {
  console.error(`Refusing to run: ${appData} already holds a Kairo database. Move it away first.`)
  process.exit(2)
}
const dataDir = mkdtempSync(join(tmpdir(), 'kairo-smoke-'))
const port = 9333
let failed = 0
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (!ok) failed++
}

const t0 = Date.now()
const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`, WEBVIEW2_USER_DATA_FOLDER: join(dataDir, 'wv') },
  stdio: 'ignore',
})
try {
  let browser
  for (let i = 0; i < 100 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`) } catch { await new Promise((r) => setTimeout(r, 200)) }
  }
  if (!browser) throw new Error('could not attach to the WebView2 instance')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForSelector('[role="dialog"]', { timeout: 15000 })
  check('cold start to first interactive screen', true, `${Date.now() - t0} ms`)

  const ipc = (cmd, args = {}) => page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args])
  // Rejections are returned as data: Playwright would otherwise flatten the structured error into a bare Error.
  const ipcErr = (cmd, args = {}) => page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a).then(() => null, (e) => e), [cmd, args])
  check('running inside Tauri', await page.evaluate(() => '__TAURI_INTERNALS__' in window))

  // Onboarding → demo data through the real backend.
  await page.getByRole('button', { name: 'Пропустить введение' }).click()
  await page.getByTestId('onboarding-finish').click()
  await page.getByTestId('project-progress').waitFor()
  const projects = await ipc('get_projects')
  check('demo workspace loaded into SQLite', projects.length === 3, `${projects.length} projects`)

  // Structured errors come from Rust, not exceptions.
  const err = await ipcErr('create_project', { input: { name: '   ' } })
  check('validation error is structured', err && err.code === 'VALIDATION', JSON.stringify(err))
  const err2 = await ipcErr('open_file', { path: 'Z:/nope/missing.txt' })
  check('missing file error is structured', err2 && err2.code === 'FILE_NOT_FOUND', JSON.stringify(err2))

  // Real timer: 1-minute session, hidden-window safe, saved by the Rust ticker.
  await ipc('update_setting', { key: 'work_min', value: 1 })
  const tasks = await ipc('get_tasks', { project_id: null })
  const task = tasks.find((t) => !t.completed_at)
  const sessionsBefore = (await ipc('get_focus_sessions', { project_id: null, task_id: null, limit: 500 })).length
  const started = await ipc('start_timer', { kind: 'work', task_id: task.id, duration_sec: null })
  check('timer started for the task', started.phase === 'running' && started.total_sec === 60 && started.project_id === task.project_id)
  await new Promise((r) => setTimeout(r, 2500))
  const tick = await ipc('get_timer_state')
  check('timer counts down in Rust', tick.remaining_sec <= 58 && tick.remaining_sec >= 55, `remaining ${tick.remaining_sec}s`)
  await ipc('pause_timer'); await new Promise((r) => setTimeout(r, 1500))
  const paused = await ipc('get_timer_state')
  check('pause freezes the clock', paused.phase === 'paused' && paused.remaining_sec === tick.remaining_sec || paused.remaining_sec === tick.remaining_sec - 1, `${paused.remaining_sec}s`)
  await ipc('resume_timer')
  console.log('…waiting for the 60 s session to finish (no UI interaction, like a minimised window)')
  for (let i = 0; i < 80; i++) {
    const s = await ipc('get_timer_state')
    if (s.phase === 'completed') break
    await new Promise((r) => setTimeout(r, 1000))
  }
  const done = await ipc('get_timer_state')
  check('session completes by itself', done.phase === 'completed' && done.completed_work_sessions === 1)
  const sessions = await ipc('get_focus_sessions', { project_id: null, task_id: null, limit: 500 })
  check('finished session is written to history', sessions.length === sessionsBefore + 1 && sessions[0].task_id === task.id && sessions[0].duration_sec === 60)
  await ipc('complete_session')

  // Analytics see the session.
  const today = new Date(); const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const a = await ipc('get_analytics', { from: key, to: key, tz_offset_min: -today.getTimezoneOffset() })
  check('analytics count the session', a.sessions >= 1 && a.focus_sec >= 60, `${a.sessions} sessions, ${a.focus_sec}s`)

  // Export → reset → import → same data.
  const out = join(dataDir, 'backup.json').replaceAll('\\', '/')
  await ipc('export_data', { path: out })
  check('export wrote a file', existsSync(out))
  const exported = JSON.parse(readFileSync(out, 'utf8'))
  const summary = await ipc('validate_backup', { path: out })
  check('backup validates', summary.projects === 3 && summary.tasks === exported.tables.tasks.length)
  await ipc('reset_data')
  check('reset empties data', (await ipc('get_projects')).length === 0)
  await ipc('import_data', { path: out })
  check('import restores everything', (await ipc('get_projects')).length === 3 && (await ipc('get_tasks', { project_id: null })).length === exported.tables.tasks.length)
  const bad = join(dataDir, 'bad.json').replaceAll('\\', '/')
  await import('node:fs').then((fs) => fs.writeFileSync(bad, '{"format":"nope"}'))
  const badErr = await ipcErr('import_data', { path: bad })
  check('invalid backup rejected, data intact', badErr?.code === 'INVALID_BACKUP' && (await ipc('get_projects')).length === 3)
  const dbCopy = join(dataDir, 'copy.db').replaceAll('\\', '/')
  await ipc('backup_database', { path: dbCopy })
  check('SQLite backup written', existsSync(dbCopy))

  await ipc('update_setting', { key: 'work_min', value: 25 })
  await page.screenshot({ path: join(process.cwd(), 'scripts', 'native-smoke.png') })
  await browser.close()
} catch (e) {
  console.error('ERROR', e)
  failed++
} finally {
  app.kill()
  await new Promise((r) => setTimeout(r, 800))
  try { rmSync(appData, { recursive: true, force: true }) } catch { /* ignore */ }
  try { rmSync(dataDir, { recursive: true, force: true }) } catch { /* ignore */ }
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll native smoke checks passed')
process.exit(failed ? 1 : 0)
