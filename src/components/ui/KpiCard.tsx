import React from 'react'
import { cx } from '../../utils/helpers'

const TONES: Record<string, string> = {
  blue: 'bg-gradient-to-br from-cyan-500/20 via-sky-500/20 to-blue-600/25 text-cyan-300 ring-1 ring-sky-400/30 shadow-sm',
  green:
    'bg-gradient-to-br from-emerald-500/20 via-teal-500/20 to-emerald-600/25 text-emerald-300 ring-1 ring-emerald-400/30 shadow-sm',
  amber:
    'bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-amber-600/25 text-amber-300 ring-1 ring-amber-400/30 shadow-sm',
  red: 'bg-gradient-to-br from-red-500/20 via-rose-500/20 to-red-600/25 text-red-300 ring-1 ring-red-400/30 shadow-sm',
  gray: 'bg-gradient-to-br from-navy-700/60 to-navy-800/80 text-ink-dim ring-1 ring-line/50 shadow-sm',
}

/** Rich multi-stop gradient accent line along the top edge. */
const RAILS: Record<string, string> = {
  blue: 'linear-gradient(90deg, #00f2fe 0%, #38bdf8 30%, #6366f1 70%, transparent)',
  green:
    'linear-gradient(90deg, #10b981 0%, #34d399 30%, #06b6d4 70%, transparent)',
  amber:
    'linear-gradient(90deg, #fbbf24 0%, #f59e0b 30%, #f97316 70%, transparent)',
  red: 'linear-gradient(90deg, #f43f5e 0%, #ef4444 30%, #b91c1c 70%, transparent)',
  gray: 'linear-gradient(90deg, rgba(148, 163, 184, 0.5) 0%, transparent)',
}

export default function KpiCard({
  label,
  value,
  icon,
  tone = 'blue',
  delta,
  sub,
  onClick,
}: {
  label: string
  value: React.ReactNode
  icon: React.ReactNode
  tone?: keyof typeof TONES
  delta?: string
  sub?: string
  onClick?: () => void
}) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'panel panel-hover group relative overflow-hidden p-4 text-left transition-all duration-300 hover:-translate-y-1',
        onClick && 'w-full cursor-pointer'
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[1.5px] rounded-t-2xl transition-opacity"
        style={{ backgroundImage: RAILS[tone] }}
      />
      <div className="relative flex items-start justify-between gap-2 z-10">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
            {label}
          </p>
          <p className="mt-1.5 font-mono text-[23px] font-bold leading-none tracking-tight text-ink group-hover:text-white transition-colors">
            {value}
          </p>
          {delta && (
            <p className="mt-1.5 text-[11px] font-medium text-emerald-300 flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {delta}
            </p>
          )}
          {sub && !delta && <p className="mt-1.5 text-[11px] text-ink-faint">{sub}</p>}
        </div>
        <div
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3',
            TONES[tone]
          )}
        >
          {icon}
        </div>
      </div>
    </Comp>
  )
}
