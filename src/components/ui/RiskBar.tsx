import { riskBarColors, riskTextColors, riskTone, cx } from '../../utils/helpers'

export default function RiskBar({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  const tone = riskTone(value)
  const bar = riskBarColors[tone]
  const text = riskTextColors[tone]

  return (
    <div>
      {showLabel && (
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Failure Risk · Next 7 days
          </span>
          <span className={cx('font-mono text-[11.5px] font-semibold', text)}>{value}%</span>
        </div>
      )}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-navy-700/70">
        <div
          className={cx('h-full rounded-full transition-all duration-700', bar)}
          style={{ width: `${Math.min(100, Math.max(2, value))}%` }}
        />
      </div>
    </div>
  )
}