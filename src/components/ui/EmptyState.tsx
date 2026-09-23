import React from 'react'
import { SearchX } from 'lucide-react'
import { cx } from '../../utils/helpers'

export default function EmptyState({
  title,
  message,
  icon,
  action,
}: {
  title: string
  message?: string
  icon?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-navy-900/40 px-6 py-12 text-center">
      <div
        className={cx(
          'flex h-12 w-12 items-center justify-center rounded-xl bg-navy-700/60 ring-1 ring-line',
        )}
      >
        {icon ?? <SearchX className="h-5 w-5 text-ink-faint" />}
      </div>
      <p className="mt-3.5 text-[13.5px] font-semibold text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-ink-faint">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}