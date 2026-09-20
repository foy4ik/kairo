import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Check, HardDrive, KanbanSquare, Sparkles, Timer } from 'lucide-react'
import { Button } from '@/components/Button'
import { Segmented, Toggle } from '@/components/Field'
import { cn } from '@/lib/utils'
import { useT } from '@/i18n'
import { useSettings } from '@/store/settings'
import { useData } from '@/store/data'
import { dataRepo } from '@/lib/repositories'
import { attempt } from '@/lib/errors'
import type { Settings } from '@/lib/types'

const CYCLE = ['project', 'task', 'focus', 'note', 'review'] as const

/** 4 short screens: value → workflow → local-first → setup (+ optional demo data). */
export function Onboarding() {
  const t = useT()
  const nav = useNavigate()
  const settings = useSettings((s) => s.settings)
  const [step, setStep] = useState(0)
  const [demo, setDemo] = useState(true)
  const [busy, setBusy] = useState(false)
  const last = step === 3

  const finish = async () => {
    setBusy(true)
    if (demo) await attempt(() => dataRepo.loadDemo(settings.language))
    await useSettings.getState().set('onboarded', true)
    await useData.getState().refresh()
    setBusy(false)
    nav('/')
  }

  const screens = [
    { icon: <Sparkles size={30} />, title: t('onboarding.1.title'), text: t('onboarding.1.text'), extra: (
      <ol className="mt-6 flex flex-wrap items-center justify-center gap-2 text-sm font-medium" aria-label={t('onboarding.cycle')}>
        {CYCLE.map((c, i) => (<li key={c} className="flex items-center gap-2"><span className="rounded-full bg-accent-soft px-3 py-1 text-accent-text">{t(`onboarding.cycle.${c}`)}</span>{i < CYCLE.length - 1 && <ArrowRight size={14} className="text-muted" aria-hidden />}</li>))}
      </ol>) },
    { icon: <KanbanSquare size={30} />, title: t('onboarding.2.title'), text: t('onboarding.2.text') },
    { icon: <HardDrive size={30} />, title: t('onboarding.3.title'), text: t('onboarding.3.text') },
    { icon: <Timer size={30} />, title: t('onboarding.4.title'), text: t('onboarding.4.text'), extra: (
      <div className="mt-6 flex flex-col items-center gap-4">
        <div className="flex flex-wrap justify-center gap-4">
          <Segmented<Settings['language']> label={t('settings.language')} value={settings.language} onChange={(v) => void useSettings.getState().set('language', v)} options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} />
          <Segmented<Settings['theme']> label={t('settings.theme')} value={settings.theme} onChange={(v) => void useSettings.getState().set('theme', v)} options={[{ value: 'light', label: t('settings.light') }, { value: 'dark', label: t('settings.dark') }, { value: 'system', label: t('settings.system') }]} />
        </div>
        <div className="w-full max-w-sm rounded-xl border border-line bg-surface px-4 py-2 text-left"><Toggle label={t('onboarding.demo')} description={t('onboarding.demoHint')} checked={demo} onChange={setDemo} /></div>
      </div>) },
  ]
  const s = screens[step]

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-bg p-6" role="dialog" aria-modal="true" aria-labelledby="onb-title">
      <div className="w-full max-w-xl text-center animate-fade-in" key={step}>
        <div className="flex min-h-[380px] flex-col items-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-white shadow-pop" aria-hidden>{s.icon}</div>
        <h1 id="onb-title" className="text-3xl font-semibold tracking-tight">{s.title}</h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted">{s.text}</p>
        {s.extra}
        </div>
        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>{t('common.back')}</Button>
          <div className="flex gap-1.5" role="presentation">{screens.map((_, i) => <span key={i} className={cn('h-1.5 rounded-full transition-all duration-200', i === step ? 'w-6 bg-accent' : 'w-1.5 bg-control')} />)}</div>
          {last
            ? <Button variant="primary" disabled={busy} onClick={() => void finish()} data-testid="onboarding-finish"><Check size={15} />{t('onboarding.start')}</Button>
            : <Button variant="primary" onClick={() => setStep(step + 1)} data-testid="onboarding-next">{t('common.next')}<ArrowRight size={15} /></Button>}
        </div>
        {!last && <button className="mt-6 text-sm text-muted hover:text-fg hover:underline" onClick={() => setStep(3)}>{t('onboarding.skip')}</button>}
      </div>
    </div>
  )
}
