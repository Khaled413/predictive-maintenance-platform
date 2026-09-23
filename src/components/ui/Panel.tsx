import React from 'react'
import { cx } from '../../utils/helpers'

interface PanelProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  as?: React.ElementType
}

export default function Panel({ children, className, hover, as: Tag = 'div' }: PanelProps) {
  return <Tag className={cx('panel', hover && 'panel-hover', className)}>{children}</Tag>
}

export function PanelHeader({
  title,
  subtitle,
  right,
  className,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  right?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex items-start justify-between gap-3 px-4 pt-3.5 sm:px-5', className)}>
      <div className="min-w-0">
        <h3 className="truncate text-[13px] font-semibold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 truncate text-[11px] text-ink-faint">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}