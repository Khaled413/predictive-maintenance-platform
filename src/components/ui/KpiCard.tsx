import React from 'react'
import { cx } from '../../utils/helpers'

const TONES: Record<string, string> = {
  blue: 'bg-sky-500/12 text-sky-300 ring-sky-400/25',
  green: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/25',
  amber: 'bg-amber-500/12 text-amber-300 ring-amber-400/25',
  red: 'bg-red-500/12 text-red-300 ring-red-400/30',
  gray: 'bg-navy-700/50 text-ink-dim ring-line',
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
        onClick && 'w-full cursor-pointer',
      )}
    >
      <div
        className={cx(
          'absolute -right-5 -top-5 h-16 w-16 rounded-full opacity-60 blur-2xl transition-opacity group-hover:opacity-100',
          tone === 'blue' && 'bg-sky-500/20',
          tone === 'green' && 'bg-emerald-500/20',
          tone === 'amber' && 'bg-amber-500/20',
          tone === 'red' && 'bg-red-500/20',
          tone === 'gray' && 'bg-transparent',
        )}
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
            TONES[tone],
          )}
        >
          {icon}
        </div>
      </div>
    </Comp>
  )
}