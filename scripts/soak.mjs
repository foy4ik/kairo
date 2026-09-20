// Long-running stability test of the REAL desktop build: drives the UI in a loop for N minutes and samples memory,
// DOM size, event listeners and console errors, then fits a trend to tell steady state from a leak.
//
// Build an isolated variant first (own identifier => own data folder, your real data is never touched):
//   npx tauri build --no-bundle --config '{"identifier":"app.kairo.soak"}'
// Run:  node scripts/soak.mjs [minutes=15] [path-to-kairo.exe]
import { chromium } from '@playwright/test'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const minutes = Number(process.argv[2] ?? 15)
const exe = process.argv[3] ?? 'C:/kairo-target/release/kairo.exe'
const dataDir = join(process.env.APPDATA ?? '', 'app.kairo.soak')
if (existsSync(join(process.env.APPDATA ?? '', 'app.kairo.desktop', 'kairo.db')) && !existsSync(dataDir)) {
  // Not an error: the isolated build uses its own identifier. This only reminds that the exe must be the soak variant.
  console.log('Note: make sure the exe was built with identifier app.kairo.soak so your real data stays untouched.')
}
const profile = mkdtempSync(join(tmpdir(), 'kairo-soak-'))
const port = 9335
const MB = 1024 * 1024

function memory() {
  // Private working set of the app and of its WebView2 processes (matched by our private profile folder).
  const ps = `
    $k = Get-Process kairo -ErrorAction SilentlyContinue | Measure-Object PrivateMemorySize64 -Sum
    $w = Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object { $_.CommandLine -like '*${profile.replaceAll('\\', '\\\\')}*' } | ForEach-Object { (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue).PrivateMemorySize64 } | Measure-Object -Sum
    "$($k.Sum) $($w.Sum)"`
  const [a, b] = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' }).trim().split(' ').map(Number)
  return { native: (a || 0) / MB, webview: (b || 0) / MB }
}

const slope = (xs, ys) => {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0), den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  return den ? num / den : 0
}

const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: join(profile, 'wv'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: 'ignore',
})
const errors = []
const samples = []
let browser
try {
  for (let i = 0; i < 100 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`) } catch { await new Promise((r) => setTimeout(r, 200)) }
  }
  if (!browser) throw new Error('could not attach to the app')
  const page = browser.contexts()[0].pages()[0]
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  const cdp = await browser.contexts()[0].newCDPSession(page)
  await cdp.send('HeapProfiler.enable')
  const ipc = (cmd, args = {}) => page.evaluate(([c, a]) => window.__TAURI_INTERNALS__.invoke(c, a), [cmd, args])

  await page.waitForSelector('[role="dialog"]', { timeout: 20000 })
  await page.getByRole('button', { name: 'Пропустить введение' }).click()
  await page.getByTestId('onboarding-finish').click()
  await page.getByTestId('project-progress').waitFor()
  await ipc('update_setting', { key: 'auto_update', value: false })

  const sample = async (label) => {
    await cdp.send('HeapProfiler.collectGarbage')
    const heap = await cdp.send('Runtime.getHeapUsage')
    const dom = await cdp.send('Memory.getDOMCounters')
    const m = memory()
    const s = { t: (Date.now() - t0) / 60000, label, heap: heap.usedSize / MB, nodes: dom.nodes, listeners: dom.jsEventListeners, native: m.native, webview: m.webview }
    samples.push(s)
    console.log(`${s.t.toFixed(1).padStart(5)} min  heap ${s.heap.toFixed(1).padStart(6)} MB  dom ${String(s.nodes).padStart(6)}  listeners ${String(s.listeners).padStart(5)}  rust ${s.native.toFixed(0).padStart(4)} MB  webview ${s.webview.toFixed(0).padStart(5)} MB  ${label}`)
  }

  const go = async (hash) => { await page.evaluate((h) => { location.hash = h }, hash); await page.waitForTimeout(250) }
  const projects = await ipc('get_projects')
  const p1 = projects[0]

  async function cycle(n) {
    for (const h of ['#/', '#/projects', `#/projects/${p1.id}`, '#/notes', '#/focus', '#/analytics', '#/settings']) await go(h)
    // Task panel open/close and palette.
    await go(`#/projects/${p1.id}`)
    const card = page.getByTestId('task-card').first()
    if (await card.count()) { await card.click(); await page.waitForTimeout(200); await page.keyboard.press('Escape') }
    await page.keyboard.press('Control+k'); await page.keyboard.type('за'); await page.waitForTimeout(250); await page.keyboard.press('Escape')
    // Data churn through the real backend: create then delete tasks and notes.
    const cols = await ipc('get_columns', { project_id: p1.id })
    const ids = []
    for (let i = 0; i < 5; i++) ids.push((await ipc('create_task', { input: { project_id: p1.id, column_id: cols[0].id, title: `soak ${n}.${i}`, tags: ['soak'] } })).id)
    await ipc('move_task', { id: ids[0], column_id: cols[1].id, position: 0 })
    await go(`#/projects/${p1.id}`)
    for (const id of ids) await ipc('delete_task', { id })
    const note = await ipc('create_note', { input: { title: `soak ${n}`, content: '# soak\n\n- [ ] a\n\n' + 'text '.repeat(400), project_id: p1.id, tags: ['soak'], task_ids: [] } })
    await go(`#/notes/${note.id}`)
    await page.waitForTimeout(300)
    await ipc('delete_note', { id: note.id })
    // Timer: short sessions (< 60 s are discarded, nothing accumulates).
    await ipc('start_timer', { kind: 'work', task_id: null, duration_sec: null })
    await page.waitForTimeout(600)
    await ipc('pause_timer'); await ipc('resume_timer'); await ipc('stop_timer')
    // Appearance switches re-render everything.
    await go('#/settings')
    await page.getByRole('radio', { name: 'Тёмная' }).click().catch(() => page.getByRole('radio', { name: 'Dark' }).click())
    await page.waitForTimeout(150)
    await page.getByRole('radio', { name: 'English' }).click().catch(() => undefined)
    await page.waitForTimeout(150)
    await page.getByRole('radio', { name: 'Русский' }).click().catch(() => undefined)
    await page.getByRole('radio', { name: 'Светлая' }).click().catch(() => undefined)
    await go('#/')
  }

  const t0 = Date.now()
  await sample('start')
  let n = 0
  const end = t0 + minutes * 60000
  let nextSample = t0 + 30000
  while (Date.now() < end) {
    await cycle(n++)
    if (Date.now() >= nextSample) { await sample(`cycle ${n}`); nextSample += 30000 }
  }
  await sample('end')

  // Verdict: fit a line through the second half (after warm-up) and extrapolate to an hour.
  const half = samples.slice(Math.floor(samples.length / 2))
  const ts = half.map((s) => s.t)
  const per = (k) => slope(ts, half.map((s) => s[k]))
  const growth = { heap: per('heap'), nodes: per('nodes'), listeners: per('listeners'), native: per('native'), webview: per('webview') }
  console.log(`\ncycles: ${n}, samples: ${samples.length}, console errors: ${errors.length}`)
  console.log('trend after warm-up (per minute):', Object.entries(growth).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v.toFixed(2)}`).join('  '))
  const verdict = {
    'JS heap grows < 0.5 MB/min': growth.heap < 0.5,
    'DOM nodes stable (< 50/min)': growth.nodes < 50,
    'event listeners stable (< 10/min)': growth.listeners < 10,
    'Rust process < 0.5 MB/min': growth.native < 0.5,
    'WebView2 processes < 2 MB/min': growth.webview < 2,
    'no console errors': errors.length === 0,
  }
  for (const [k, ok] of Object.entries(verdict)) console.log(`${ok ? 'PASS' : 'FAIL'}  ${k}`)
  if (errors.length) console.log([...new Set(errors)].slice(0, 8).join('\n'))
  writeFileSync(join(process.cwd(), 'scripts', 'soak-result.json'), JSON.stringify({ minutes, cycles: n, samples, growth, errors: [...new Set(errors)] }, null, 2))
  await browser.close()
  process.exitCode = Object.values(verdict).every(Boolean) ? 0 : 1
} catch (e) {
  console.error('ERROR', e)
  process.exitCode = 1
} finally {
  app.kill()
  await new Promise((r) => setTimeout(r, 1000))
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* ignore */ }
}
