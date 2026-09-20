// Records the 30-60 s portfolio demo (scenario from the spec, section 20.1) as a video.
// It drives the real React UI in Edge (in-memory backend, fake clock so a 25-minute focus session fits the video),
// with an on-screen cursor and short captions. Output: docs/demo/kairo-demo.webm (+ .mp4 when ffmpeg is available).
//
// Usage: npm run dev (other terminal), then: node scripts/demo-video.mjs
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.env.BASE_URL ?? 'http://127.0.0.1:1420'
const out = 'docs/demo'
mkdirSync(out, { recursive: true })
const tmp = mkdtempSync(join(tmpdir(), 'kairo-demo-'))
const size = { width: 1280, height: 800 }
const browser = await chromium.launch({ channel: 'msedge' })

// 1) Prepare a workspace with demo data once, keep its storage (localStorage holds the in-memory backend).
const prep = await browser.newContext({ viewport: size })
const pp = await prep.newPage()
await pp.addInitScript(() => localStorage.setItem('kairo-mock-db-v1', JSON.stringify({ settings: { language: 'ru', theme: 'dark', work_min: 25, short_break_min: 5, long_break_min: 15, long_break_every: 4, notifications: true, sound: false, auto_update: false, onboarded: true } })))
await pp.goto(`${base}/#/settings`)
await pp.getByRole('button', { name: 'Загрузить демо-данные' }).first().click()
await pp.getByRole('dialog').getByRole('button', { name: 'Загрузить демо-данные' }).click()
await pp.getByText('Демо-данные добавлены').waitFor()
const state = await prep.storageState()
await prep.close()

// 2) The recording itself.
const ctx = await browser.newContext({ viewport: size, storageState: state, recordVideo: { dir: tmp, size }, colorScheme: 'dark' })
const page = await ctx.newPage()
await page.clock.install()
await page.addInitScript(() => {
  window.__KAIRO_FAKE_UPDATE__ = { version: '0.2.0', notes: '- Новые возможности и исправления\n- Улучшена производительность' }
  const add = () => {
    if (document.getElementById('demo-cursor')) return
    const style = document.createElement('style')
    style.textContent = `
      #demo-cursor{position:fixed;z-index:2147483647;left:0;top:0;width:22px;height:22px;pointer-events:none;transform:translate(-3px,-2px);transition:transform 40ms linear;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))}
      #demo-ripple{position:fixed;z-index:2147483646;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #8b93ff;pointer-events:none;opacity:0}
      #demo-ripple.go{animation:demo-r .5s ease-out}
      @keyframes demo-r{0%{opacity:.9;transform:scale(.6)}100%{opacity:0;transform:scale(3.2)}}
      #demo-cap{position:fixed;z-index:2147483645;left:50%;bottom:26px;transform:translateX(-50%);max-width:80%;padding:10px 20px;border-radius:12px;background:rgba(15,16,22,.88);color:#fff;font:600 17px/1.3 Inter Variable,system-ui,sans-serif;letter-spacing:.1px;box-shadow:0 8px 30px rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.12);opacity:0;transition:opacity .25s;pointer-events:none;text-align:center}
      #demo-cap.on{opacity:1}
      #demo-title{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:radial-gradient(circle at 50% 40%,#23254a,#0e0f12 70%);color:#fff;font-family:Inter Variable,system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .6s}
      #demo-title.on{opacity:1}
      #demo-title b{font-size:64px;letter-spacing:-1.5px} #demo-title span{font-size:20px;color:#b7bbe0} #demo-title i{font-style:normal;font-size:16px;color:#8b93ff}`
    document.head.append(style)
    const cur = document.createElement('div'); cur.id = 'demo-cursor'
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l15 9-6.5 1.6L9 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    const rip = document.createElement('div'); rip.id = 'demo-ripple'
    const cap = document.createElement('div'); cap.id = 'demo-cap'
    const title = document.createElement('div'); title.id = 'demo-title'
    title.innerHTML = '<b>Kairo</b><span>Проекты · задачи · заметки · фокус — локально, на вашем компьютере</span><i>Tauri · Rust · SQLite · React · github.com/foy4ik/kairo</i>'
    document.body.append(cur, rip, cap, title)
    document.addEventListener('mousemove', (e) => { cur.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)` }, true)
    document.addEventListener('mousedown', (e) => { rip.style.left = e.clientX + 'px'; rip.style.top = e.clientY + 'px'; rip.classList.remove('go'); void rip.offsetWidth; rip.classList.add('go') }, true)
  }
  document.addEventListener('DOMContentLoaded', add)
  window.addEventListener('load', add)
  window.__caption = (t) => { const c = document.getElementById('demo-cap'); if (!c) return; if (t) { c.textContent = t; c.classList.add('on') } else c.classList.remove('on') }
  window.__title = (on) => document.getElementById('demo-title')?.classList.toggle('on', on)
})

const pause = (ms) => page.waitForTimeout(ms)
const caption = (t) => page.evaluate((x) => window.__caption(x), t)
async function glide(loc, { steps = 28, dx = 0, dy = 0 } = {}) {
  await loc.scrollIntoViewIfNeeded()
  const b = await loc.boundingBox()
  await page.mouse.move(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy, { steps })
}
async function click(loc, opts) { await glide(loc, opts); await pause(120); await loc.click(); }
async function type(text, delay = 55) { await page.keyboard.type(text, { delay }) }

await page.goto(base)
await page.getByTestId('project-progress').waitFor()
await page.mouse.move(640, 300)
await pause(600)

// 1. Dashboard
await caption('Kairo — проекты, задачи, заметки и фокус в одном приложении')
await pause(2300)

// 2. Project and a new task by keyboard
await caption('Проект: доска задач')
await click(page.getByRole('link', { name: 'Запуск Kairo' }))
await page.getByTestId('board').waitFor()
await pause(1500)
await caption('Новая задача — горячей клавишей N')
await page.mouse.move(700, 500, { steps: 20 })
await page.keyboard.press('n')
await pause(500)
await type('Подготовить релиз 0.2 #docs !high')
await pause(400)
await page.keyboard.press('Control+Enter')
await pause(1400)

// 3. Drag & drop: Backlog -> In progress
await caption('Перетаскивание с сохранением порядка')
const card = page.getByTestId('task-card').filter({ hasText: 'Подготовить релиз 0.2' }).first()
const target = page.getByTestId('kanban-column').nth(1).locator('div.min-h-\\[64px\\]')
const cb = await card.boundingBox(), tb = await target.boundingBox()
await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2, { steps: 24 })
await pause(150)
await page.mouse.down()
await page.mouse.move(cb.x + cb.width / 2 + 10, cb.y + cb.height / 2 + 10, { steps: 4 })
await page.mouse.move(tb.x + tb.width / 2, tb.y + 40, { steps: 40 })
await pause(300)
await page.mouse.up()
await pause(1500)

// 4. Task panel
await caption('Детали задачи без потери контекста: чек-лист, теги, срок')
await click(page.getByTestId('task-card').filter({ hasText: 'Подготовить релиз 0.2' }).first())
const panel = page.getByTestId('task-panel')
await panel.waitFor()
await pause(900)
await click(panel.getByLabel('Новый пункт'))
await type('Сценарий', 60)
await page.keyboard.press('Enter')
await pause(600)
await type('Запись экрана', 60)
await page.keyboard.press('Enter')
await pause(500)
await click(panel.getByRole('checkbox', { name: 'Сценарий' }))
await pause(1400)
await page.keyboard.press('Escape')
await pause(600)

// 5. Note linked to a task
await caption('Markdown-заметки со связью с задачами')
await click(page.getByRole('tab', { name: 'Заметки' }))
await pause(700)
await click(page.getByTestId('note-list').getByRole('button').first())
await pause(1200)
const editor = page.getByLabel('Текст заметки')
await click(editor)
await page.keyboard.press('Control+End')
await type('\n\n## Идея\n\nСнять демо за **60 секунд**.', 45)
await pause(1100)
await click(page.getByTestId('note-preview').getByRole('checkbox').first())
await pause(1300)

// 6. Focus
await caption('Фокус-сессия привязана к задаче')
await click(page.getByRole('link', { name: 'Фокус', exact: true }))
await pause(600)
await page.getByTestId('focus-task-select').selectOption({ label: 'Реализовать фокус-таймер' })
await pause(700)
await click(page.getByRole('button', { name: /^Старт/ }))
await pause(2600)
await page.keyboard.press('Space')
await pause(1200)
await page.keyboard.press('Space')
await pause(800)
await caption('Таймер работает в фоне, сессия попадает в историю')
await page.clock.fastForward(25 * 60_000 + 1000)
await page.getByText('Сессия завершена').first().waitFor()
await pause(1800)

// 7. Analytics
await caption('Аналитика: сессия уже учтена')
await click(page.getByRole('link', { name: 'Аналитика', exact: true }))
await pause(2400)

// 8. Command palette + theme
await caption('Командная палитра — Ctrl+K')
await page.keyboard.press('Control+k')
await pause(700)
await type('тем', 120)
await pause(1100)
await page.keyboard.press('Enter')
await pause(1800)
await caption('Светлая и тёмная темы, RU / EN без перезапуска')
await pause(2200)

// 9. Data + updates
await caption('Экспорт, импорт и автообновление с согласием пользователя')
await click(page.getByRole('link', { name: 'Настройки' }))
await pause(600)
await page.getByTestId('update-check').scrollIntoViewIfNeeded()
await pause(900)
await click(page.getByTestId('update-check'))
await page.clock.fastForward(400)
const dlg = page.getByRole('dialog', { name: 'Доступно обновление Kairo' })
await dlg.waitFor()
await pause(2400)
await click(dlg.getByRole('button', { name: 'Позже' }))
await pause(700)

// 10. Closing card
await caption('')
await page.evaluate(() => window.__title(true))
await pause(2600)

const video = page.video()
await ctx.close()
const webm = await video.path()
await browser.close()
copyFileSync(webm, join(out, 'kairo-demo.webm'))
rmSync(tmp, { recursive: true, force: true })
console.log('saved', join(out, 'kairo-demo.webm'))
const ff = process.env.FFMPEG || 'ffmpeg'
try {
  execFileSync(ff, ['-y', '-loglevel', 'error', '-i', join(out, 'kairo-demo.webm'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(out, 'kairo-demo.mp4')])
  console.log('saved', join(out, 'kairo-demo.mp4'))
} catch {
  console.log('ffmpeg not found: only the .webm was written (set FFMPEG=path to also produce .mp4)')
}
