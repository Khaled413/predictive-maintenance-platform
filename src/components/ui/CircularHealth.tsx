import { useId } from 'react'
import { HEALTH_CIRCLE_COLORS, cx } from '../../utils/helpers'
import type { MachineStatus } from '../../types'

const GRADIENTS: Record<string, { from: string; to: string }> = {
  ok: { from: '#10b981', to: '#06b6d4' },
  warn: { from: '#fbbf24', to: '#f97316' },
  danger: { from: '#f43f5e', to: '#dc2626' },
}

export default function CircularHealth({
  value,
  size = 72,
  strokeWidth = 6,
  animate = true,
  warningThreshold = 70,
  criticalThreshold = 40,
  status,
}: {
  value: number
  size?: number
  strokeWidth?: number
  animate?: boolean
  warningThreshold?: number
  criticalThreshold?: number
  status?: Exclude<MachineStatus, 'Under Maintenance'>
}) {
  const gradId = useId()
  const tone = status
    ? status === 'Critical'
      ? 'danger'
      : status === 'Warning'
        ? 'warn'
        : 'ok'
    : value <= criticalThreshold
      ? 'danger'
      : value <= warningThreshold
        ? 'warn'
        : 'ok'
  const colors = HEALTH_CIRCLE_COLORS[tone]
  const grad = GRADIENTS[tone]
  const r = (size - strokeWidth) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - value / 100)

  return (
    <div
      className="relative inline-flex items-center justify-center transition-transform hover:scale-105 duration-200"
      style={{ width: size, height: size }}
      title={`Health score ${Math.round(value)}%${status ? ` · combined model status ${status}` : ''}`}
    >
      <svg width={size} height={size} className="-rotate-90 overflow-visible">
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={grad.from} />
            <stop offset="100%" stopColor={grad.to} />
          </linearGradient>
        </defs>
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
          stroke={`url(#${gradId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={animate ? offset : c * 0.25}
          style={{
            transition: 'stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={cx('font-mono font-bold leading-none tracking-tight', colors.text)}
          style={{ fontSize: size * 0.25 }}
        >
          {Math.round(value)}
          <span className="text-[0.6em] opacity-80">%</span>
        </span>
      </div>
    </div>
  )
}
