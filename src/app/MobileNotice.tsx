import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/Button'
import { RELEASES_URL, demoAsset } from '@/lib/demo'
import { useT } from '@/i18n'

const SHOTS: Array<[string, string]> = [
  ['02-board.png', 'demo.shot.board'],
  ['03-notes.png', 'demo.shot.notes'],
  ['04-focus.png', 'demo.shot.focus'],
  ['05-analytics.png', 'demo.shot.analytics'],
]

/** Phones: the interface is built for a wide desktop window, so instead of a cramped app the visitor first sees what it
 *  looks like (screenshots, video) and can still open the live demo. Shown once per visit on narrow screens. */
export function MobileNotice() {
  const t = useT()
  const [open, setOpen] = useState(() => window.innerWidth < 768)
  if (!open) return null
  return (
    <div role="dialog" aria-modal="true" aria-label={t('demo.mobileTitle')} data-testid="mobile-notice" className="fixed inset-0 z-[100] overflow-y-auto bg-bg p-5">
      <div className="mx-auto flex max-w-md flex-col gap-4 pb-10">
        <h1 className="text-xl font-semibold tracking-tight">{t('demo.mobileTitle')}</h1>
        <p className="text-sm text-muted">{t('demo.mobileText')}</p>
        <Button variant="primary" onClick={() => setOpen(false)} data-testid="mobile-notice-open">{t('demo.mobileOpen')}</Button>
        <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent-text underline underline-offset-2">
          <Download size={14} aria-hidden />{t('demo.download')}
        </a>
        <video controls preload="none" playsInline className="w-full rounded-xl border border-line" aria-label={t('demo.video')} poster={demoAsset('screenshots/01-dashboard.png')}>
          <source src={demoAsset('kairo-demo.mp4')} type="video/mp4" />
        </video>
        {SHOTS.map(([file, key]) => (
          <img key={file} src={demoAsset(`screenshots/${file}`)} alt={t(key as 'demo.shot.board')} loading="lazy" className="w-full rounded-xl border border-line" />
        ))}
      </div>
    </div>
  )
}
