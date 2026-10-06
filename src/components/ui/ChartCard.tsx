import React from 'react'
import { cx } from '../../utils/helpers'
import Panel, { PanelHeader } from './Panel'

export function ChartCard({
  title,
  subtitle,
  right,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <Panel className={cx('overflow-hidden', className)}>
      <PanelHeader title={title} subtitle={subtitle} right={right} />
      <div className={cx('px-3 pb-3 pt-2 sm:px-5', bodyClassName)}>{children}</div>
    </Panel>
  )
}

/** Shared dark tooltip for all Recharts charts. */
const chartTooltipStyle: React.CSSProperties = {
  background: 'var(--chart-tooltip-bg)',
  border: '1px solid rgba(148, 163, 184, 0.15)',
  borderRadius: '10px',
  fontSize: '11px',
  fontFamily: 'JetBrains Mono, monospace',
  color: 'var(--chart-tooltip-text)',
  boxShadow: '0 12px 32px -12px rgba(0,0,0,0.7)',
  padding: '8px 10px',
}

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{
    name?: string
    dataKey?: string | number
    color?: string
    stroke?: string
    value?: number
  }>
  label?: React.ReactNode
  formatter?: (value: number) => React.ReactNode
}

export function ChartTooltip({ active, payload, label, formatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div style={chartTooltipStyle}>
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.name ?? p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? p.stroke }} />
          <span style={{ color: 'var(--chart-tooltip-muted)' }}>{p.name ?? p.dataKey}:</span>
          <span style={{ color: 'var(--chart-tooltip-text)' }}>{formatter ? formatter(p.value ?? 0) : p.value}</span>
        </p>
      ))}
    </div>
  )
}