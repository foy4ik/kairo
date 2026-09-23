/* Runs before the app bundle, as plain ES5 so that even a very old web engine can execute it.
   The interface needs a 2023-or-newer WebKit/Chromium (CSS cascade layers, @property, color-mix). On an old macOS the
   system Safari engine is older than that, and without this check the window would simply stay blank. */
(function () {
  var css = window.CSS
  var supported = !!(
    css && css.supports && css.registerProperty &&
    css.supports('color', 'color-mix(in srgb, red, blue)') &&
    typeof window.CSSLayerBlockRule !== 'undefined'
  )
  if (supported) return

  window.__kairoUnsupported = true // the bundle checks this and does not try to render
  var ru = /^ru/i.test(navigator.language || '')
  var box = document.getElementById('root')
  if (!box) return
  box.innerHTML =
    '<div style="box-sizing:border-box;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;' +
    'font:15px/1.5 -apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;color:#1f2430;background:#f6f6f8">' +
    '<div style="max-width:480px"><h1 style="margin:0 0 12px;font-size:22px">' +
    (ru ? 'Kairo не может показать интерфейс' : 'Kairo cannot show its interface') +
    '</h1><p style="margin:0 0 10px">' +
    (ru
      ? 'Встроенный в систему браузерный движок слишком старый. Данные не затронуты — приложение просто не может нарисовать окно.'
      : 'The web engine built into your system is too old. Your data is untouched — the app just cannot draw its window.') +
    '</p><p style="margin:0">' +
    (ru
      ? 'Обновите macOS (нужна версия 11 «Big Sur» или новее) и Safari до версии 16.4 или новее, затем откройте Kairo снова.'
      : 'Update macOS (version 11 "Big Sur" or newer is required) and Safari to version 16.4 or newer, then open Kairo again.') +
    '</p></div></div>'
}())
