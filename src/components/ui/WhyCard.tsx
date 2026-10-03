import { useState } from 'react'
import { Brain, ChevronDown, HelpCircle, ShieldCheck } from 'lucide-react'
import { cx } from '../../utils/helpers'

export interface WhyFactor {
  label: string
  delta: string // e.g. "+18%"
  tone: 'up' | 'down' | 'flat'
  note: string
}

export default function WhyCard({
  title,
  factors,
  conclusion,
  accent = 'danger',
}: {
  title: string
  factors: WhyFactor[]
  conclusion: string
  accent?: 'danger' | 'warning' | 'ok'
}) {
  const [open, setOpen] = useState(false)

  const factorTone =
    accent === 'danger'
      ? { pill: 'border-red-400/25 text-red-300', arrow: 'text-red-400', dot: 'bg-red-400' }
      : accent === 'warning'
        ? { pill: 'border-amber-400/25 text-amber-300', arrow: 'text-amber-400', dot: 'bg-amber-400' }
        : { pill: 'border-emerald-400/25 text-emerald-300', arrow: 'text-emerald-400', dot: 'bg-emerald-400' }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-navy-850">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-navy-800/60"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/12 ring-1 ring-sky-400/25">
          <Brain className="h-4 w-4 text-sky-300" />
        </span>
        <span className="flex-1">
          <span className="block text-[12.5px] font-semibold text-ink">Explainable AI</span>
          <span className="mt-0.5 block text-[11px] text-ink-faint">{title}</span>
        </span>
        <ChevronDown
          className={cx('h-4 w-4 text-ink-faint transition-transform duration-200', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="animate-fadeUp border-t border-line px-4 py-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {factors.map((f) => (
              <div
                key={f.label}
                className="rounded-xl border border-line bg-navy-900/60 px-3 py-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-medium text-ink-dim">{f.label}</span>
                  <span
                    className={cx(
                      'font-mono text-[11.5px] font-bold',
                      f.tone === 'up'
                        ? 'text-red-300'
                        : f.tone === 'down'
                          ? 'text-emerald-300'
                          : 'text-ink-dim',
                    )}
                  >
                    {f.delta}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={cx('h-1.5 w-1.5 rounded-full', factorTone.dot)} />
                  <span className="text-[10.5px] text-ink-faint">{f.note}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-sky-400/20 bg-sky-500/5 px-3 py-2.5">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
            <p className="text-[11.5px] leading-relaxed text-ink-dim">{conclusion}</p>
          </div>
          <p className="mt-2.5 flex items-center gap-1.5 text-[10px] text-ink-faint">
            <HelpCircle className="h-3 w-3" />
            Recommendation generated from sensor telemetry + historical failure patterns
            (prototype logic).
          </p>
        </div>
      )}
    </div>
  )
}