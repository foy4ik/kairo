import { useState } from 'react'
import { Download, X } from 'lucide-react'
import { RELEASES_URL } from '@/lib/demo'
import { useT } from '@/i18n'

const KEY = 'kairo-demo-banner-hidden'
const read = (): boolean => { try { return window.localStorage.getItem(KEY) === '1' } catch { return false } }

/** Slim strip above the app in the web demo: where the data lives, and where to get the real desktop app. */
export function DemoBanner() {
  const t = useT()
  const [hidden, setHidden] = useState(read)
  if (hidden) return null
  return (
    <div role="note" data-testid="demo-banner" className="flex shrink-0 items-center gap-3 bg-accent-soft px-4 py-1.5 text-xs text-accent-text">
      <span className="min-w-0 flex-1">
        {t('demo.banner')} <span className="lg:hidden">{t('demo.narrow')}</span>
      </span>
      <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 font-medium underline underline-offset-2">
        <Download size={12} aria-hidden />{t('demo.download')}
      </a>
      <button
        type="button" aria-label={t('demo.dismiss')}
        onClick={() => { setHidden(true); try { window.localStorage.setItem(KEY, '1') } catch { /* private mode: hide for this visit only */ } }}
        className="shrink-0 rounded p-0.5 hover:bg-black/5"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  )
}
