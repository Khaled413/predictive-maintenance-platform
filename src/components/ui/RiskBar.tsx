import { clamp, riskTextColors, cx } from '../../utils/helpers'
import { usePreferences } from '../../context/PreferencesContext'

const GRADIENT_BARS = {
  ok: 'bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 shadow-sm',
  warn: 'bg-gradient-to-r from-amber-500 via-orange-400 to-amber-300 shadow-sm',
  danger: 'bg-gradient-to-r from-red-600 via-rose-500 to-red-400 shadow-sm',
}

export default function RiskBar({
  value,
  showLabel = true,
  warningThreshold = 50,
  criticalThreshold = 70,
}: {
  value: number
  showLabel?: boolean
  warningThreshold?: number
  criticalThreshold?: number
}) {
  const { t } = usePreferences()
  const safeValue = clamp(Number.isFinite(value) ? value : 0)
  const warning = clamp(Number.isFinite(warningThreshold) ? warningThreshold : 50)
  const critical = clamp(Number.isFinite(criticalThreshold) ? criticalThreshold : 70)
  const tone = safeValue >= critical ? 'danger' : safeValue >= warning ? 'warn' : 'ok'
  const barClass = GRADIENT_BARS[tone]
  const text = riskTextColors[tone]

  return (
    <div>
      {showLabel && (
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            {t('Model Failure Probability')}
          </span>
          <span className={cx('font-mono text-[12px] font-bold tracking-tight', text)}>
            {safeValue.toFixed(1)}%
          </span>
        </div>
      )}
      <div
        className="relative mt-1 h-3.5 w-full overflow-hidden rounded-full bg-navy-950/80 border border-line/50 p-0.5 shadow-inner"
        role="progressbar"
        aria-label={t('Model Failure Probability')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeValue}
        aria-valuetext={`${safeValue.toFixed(1)}% failure risk; warning at ${warning}%, critical at ${critical}%`}
      >
        <div
          className="absolute inset-y-0 bg-amber-400/20"
          style={{ left: `${warning}%`, width: `${Math.max(0, critical - warning)}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-red-500/20"
          style={{ left: `${critical}%` }}
        />
        <div
          className={cx(
            'relative h-full rounded-full transition-all duration-700',
            barClass
          )}
          style={{ width: `${safeValue}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 z-10 w-0.5 bg-amber-300/90"
          style={{ left: `${warning}%` }}
        />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 z-10 w-0.5 bg-red-400"
          style={{ left: `${critical}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[8px] font-mono text-ink-faint">
        <span>0%</span>
        <span className="text-amber-300 font-semibold">{`${t('Warning limit')} ${warning}%`}</span>
        <span className="text-red-300 font-semibold">{`${t('Critical limit')} ${critical}%`}</span>
        <span>100%</span>
      </div>
    </div>
  )
}
