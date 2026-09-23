import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { SensorReading } from '../../types'
import { sensorLevelClasses, cx } from '../../utils/helpers'

function Trend({ trend }: { trend: SensorReading['trend'] }) {
  if (trend === 'up') return <TrendingUp className="h-3.5 w-3.5 text-red-400" />
  if (trend === 'down') return <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
  return <Minus className="h-3.5 w-3.5 text-ink-faint" />
}

export default function SensorList({
  sensors,
  compact = false,
}: {
  sensors: SensorReading[]
  compact?: boolean
}) {
  return (
    <div className="space-y-2">
      {sensors.map((s) => {
        const c = sensorLevelClasses[s.level]
        const span = Math.min(100, Math.max(4, ((s.value - s.min) / (s.max - s.min)) * 100))
        return (
          <div key={s.name} className="flex items-center gap-2.5">
            {compact ? (
              <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', c.dot)} />
            ) : (
              <span className="w-[74px] shrink-0 text-[10.5px] font-medium text-ink-dim">
                {s.name}
              </span>
            )}
            <div className="h-1 w-full min-w-0 flex-1 overflow-hidden rounded-full bg-navy-700/70">
              <div
                className={cx('h-full rounded-full transition-all duration-500', c.bar)}
                style={{ width: `${span}%` }}
              />
            </div>
            <span className={cx('w-[66px] shrink-0 text-right font-mono text-[10.5px] font-medium', c.text)}>
              {s.value}
              <span className="ml-0.5 text-[9px] text-ink-faint">{s.unit}</span>
            </span>
            <span className="w-4 shrink-0 text-right">
              <Trend trend={s.trend} />
            </span>
          </div>
        )
      })}
    </div>
  )
}