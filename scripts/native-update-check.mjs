// Checks the REAL updater of a desktop build against the live GitHub update feed, without installing anything.
// The app uses the normal data folder (Windows ignores an APPDATA override), so this script performs NO writes:
// it only opens the update dialog, presses "Later" and looks at Settings. Only the WebView2 profile is temporary.
// Usage:  node scripts/native-update-check.mjs <path-to-kairo.exe>
import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exe = process.argv[2]
if (!exe) { console.error('Usage: node scripts/native-update-check.mjs <path-to-kairo.exe>'); process.exit(2) }
const sandbox = mkdtempSync(join(tmpdir(), 'kairo-upd-'))
const port = 9334
let failed = 0
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`); if (!ok) failed++ }

const app = spawn(exe, [], {
  env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: join(sandbox, 'wv'), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}` },
  stdio: 'ignore',
})
try {
  let browser
  for (let i = 0; i < 100 && !browser; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`) } catch { await new Promise((r) => setTimeout(r, 200)) }
  }
  if (!browser) throw new Error('could not attach to the app')
  const page = browser.contexts()[0].pages()[0]
  await page.waitForSelector('[role="dialog"]', { timeout: 20000 })

  // Automatic check runs a few seconds after launch and must open the consent dialog (nothing is downloaded yet).
  const dialog = page.getByRole('dialog', { name: 'Доступно обновление Kairo' })
  await dialog.waitFor({ timeout: 30000 })
  const version = await dialog.getByTestId('update-version').innerText()
  const text = await dialog.innerText()
  check('automatic check found an update on GitHub', /Версия \d+\.\d+\.\d+/.test(version), version)
  check('dialog shows the installed version', /сейчас установлена \d+\.\d+\.\d+/.test(text))
  check('dialog lists what is new', /что нового/i.test(text))
  check('dialog says user data is kept', /данные хранятся отдельно/.test(text))
  await page.screenshot({ path: join(process.cwd(), 'scripts', 'native-update-dialog.png') })

  // "Later" must not download or install anything and must keep the offer in Settings.
  await dialog.getByRole('button', { name: 'Позже' }).click()
  // Only a brand-new installation shows onboarding (and has no user data to protect).
  const skip = page.getByRole('button', { name: 'Пропустить введение' })
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await page.getByTestId('onboarding-finish').click()
  }
  await page.getByRole('link', { name: 'Настройки' }).click()
  await page.getByTestId('update-open').waitFor({ timeout: 5000 })
  check('offer stays available in Settings', /Доступна версия/.test(await page.getByTestId('update-open').innerText()))
  await browser.close()
} catch (e) {
  console.error('ERROR', e)
  failed++
} finally {
  app.kill()
  await new Promise((r) => setTimeout(r, 800))
  try { rmSync(sandbox, { recursive: true, force: true }) } catch { /* ignore */ }
}
console.log(failed ? `\n${failed} check(s) failed` : '\nUpdater check passed')
process.exit(failed ? 1 : 0)
