import { clamp, riskBarColors, riskTextColors, cx } from '../../utils/helpers'
import { usePreferences } from '../../context/PreferencesContext'

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
  const bar = riskBarColors[tone]
  const text = riskTextColors[tone]

  return (
    <div>
      {showLabel && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            {t('Model Failure Probability')}
          </span>
          <span className={cx('font-mono text-[11.5px] font-semibold', text)}>{safeValue.toFixed(1)}%</span>
        </div>
      )}
      <div
        className="relative mt-1 h-3 w-full overflow-hidden rounded-full bg-emerald-500/20"
        role="progressbar"
        aria-label={t('Model Failure Probability')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={safeValue}
        aria-valuetext={`${safeValue.toFixed(1)}% failure risk; warning at ${warning}%, critical at ${critical}%`}
      >
        <div
          className="absolute inset-y-0 bg-amber-400/30"
          style={{ left: `${warning}%`, width: `${Math.max(0, critical - warning)}%` }}
        />
        <div className="absolute inset-y-0 right-0 bg-red-500/30" style={{ left: `${critical}%` }} />
        <div
          className={cx('absolute inset-y-0 left-0 rounded-full transition-all duration-700', bar)}
          style={{ width: `${safeValue}%` }}
        />
        <span aria-hidden="true" className="absolute inset-y-0 z-10 w-0.5 bg-white/70" style={{ left: `${warning}%` }} />
        <span aria-hidden="true" className="absolute inset-y-0 z-10 w-0.5 bg-white" style={{ left: `${critical}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[8px] font-mono text-ink-faint">
        <span>0%</span>
        <span className="text-amber-300">{`${t('Warning limit')} ${warning}%`}</span>
        <span className="text-red-300">{`${t('Critical limit')} ${critical}%`}</span>
        <span>100%</span>
      </div>
    </div>
  )
}