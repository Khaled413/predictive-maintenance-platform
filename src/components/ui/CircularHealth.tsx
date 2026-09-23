import { HEALTH_CIRCLE_COLORS, healthTone, cx } from '../../utils/helpers'

export default function CircularHealth({
  value,
  size = 72,
  strokeWidth = 6,
  animate = true,
}: {
  value: number
  size?: number
  strokeWidth?: number
  animate?: boolean
}) {
  const tone = healthTone(value)
  const colors = HEALTH_CIRCLE_COLORS[tone]
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - value / 100)

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      title={`Health Score ${Math.round(value)}%`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors.track}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={animate ? offset : c * 0.25}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={cx('font-mono font-semibold leading-none', colors.text)} style={{ fontSize: size * 0.24 }}>
          {Math.round(value)}
          <span className="text-[0.6em]">%</span>
        </span>
      </div>
    </div>
  )
}