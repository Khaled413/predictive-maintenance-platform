import React from 'react'
import { cx } from '../../utils/helpers'

const TONES: Record<string, string> = {
  blue: 'bg-sky-500/12 text-sky-300 ring-sky-400/25',
  green: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/25',
  amber: 'bg-amber-500/12 text-amber-300 ring-amber-400/25',
  red: 'bg-red-500/12 text-red-300 ring-red-400/30',
  gray: 'bg-navy-700/50 text-ink-dim ring-line',
}

/** Gradient wash in the card corner, per tone. */
const WASHES: Record<string, string> = {
  blue: 'radial-gradient(120px 80px at 100% 0%, rgba(56, 189, 248, 0.22), transparent 70%)',
  green:
    'radial-gradient(120px 80px at 100% 0%, rgba(52, 211, 153, 0.22), transparent 70%)',
  amber:
    'radial-gradient(120px 80px at 100% 0%, rgba(251, 191, 36, 0.22), transparent 70%)',
  red: 'radial-gradient(120px 80px at 100% 0%, rgba(248, 113, 113, 0.24), transparent 70%)',
  gray: 'none',
}

/** Thin gradient accent line along the top edge. */
const RAILS: Record<string, string> = {
  blue: 'linear-gradient(90deg, rgba(56, 189, 248, 0.7), rgba(99, 102, 241, 0.35) 55%, transparent)',
  green:
    'linear-gradient(90deg, rgba(52, 211, 153, 0.7), rgba(20, 184, 166, 0.35) 55%, transparent)',
  amber:
    'linear-gradient(90deg, rgba(251, 191, 36, 0.7), rgba(249, 115, 22, 0.35) 55%, transparent)',
  red: 'linear-gradient(90deg, rgba(248, 113, 113, 0.7), rgba(244, 63, 94, 0.35) 55%, transparent)',
  gray: 'linear-gradient(90deg, rgba(148, 163, 184, 0.35), transparent)',
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
        'panel panel-hover group relative overflow-hidden p-4 text-left',
        onClick && 'w-full cursor-pointer'
      )}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px] rounded-t-2xl"
        style={{ backgroundImage: RAILS[tone] }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-80 transition-opacity duration-300 group-hover:opacity-100"
        style={{ backgroundImage: WASHES[tone] }}
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-faint">
            {label}
          </p>
          <p className="mt-1.5 font-mono text-[22px] font-bold leading-none tracking-tight text-ink">
            {value}
          </p>
          {delta && (
            <p className="mt-1.5 text-[11px] font-medium text-emerald-300">{delta}</p>
          )}
          {sub && !delta && <p className="mt-1.5 text-[11px] text-ink-faint">{sub}</p>}
        </div>
        <div
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1',
            TONES[tone]
          )}
        >
          {icon}
        </div>
      </div>
    </Comp>
  )
}
