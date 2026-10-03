import {
  statusBadge,
  severityClasses,
  cx,
} from '../../utils/helpers'
import type { MachineStatus, Severity } from '../../types'

export function MachineStatusBadge({
  status,
  className,
}: {
  status: MachineStatus
  className?: string
}) {
  const s = statusBadge[status]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] font-semibold',
        s.pill,
        s.text,
        className,
      )}
    >
      <span className={cx('h-1.5 w-1.5 rounded-full', s.dot)} />
      {status}
    </span>
  )
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = severityClasses[severity]
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] font-semibold uppercase tracking-wide',
        s.pill,
        s.text,
      )}
    >
      {severity}
    </span>
  )
}

const PRIORITY_STYLES: Record<string, string> = {
  High: 'border-red-400/30 bg-red-500/10 text-red-300',
  Medium: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  Low: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300',
}

export function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-lg border px-2 py-1 text-[10.5px] font-semibold',
        PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.Medium,
      )}
    >
      {priority}
    </span>
  )
}

const MAINT_STATUS_STYLES: Record<string, { pill: string; text: string }> = {
  Completed: { pill: 'border-emerald-400/25 bg-emerald-500/10', text: 'text-emerald-300' },
  Cancelled: { pill: 'border-line bg-navy-700/40', text: 'text-ink-faint' },
  'In Progress': { pill: 'border-sky-400/25 bg-sky-500/10', text: 'text-sky-300' },
  Scheduled: { pill: 'border-blue-400/25 bg-blue-500/10', text: 'text-blue-300' },
  Recommended: { pill: 'border-amber-400/25 bg-amber-500/10', text: 'text-amber-300' },
  'On Schedule': { pill: 'border-emerald-400/25 bg-emerald-500/10', text: 'text-emerald-300' },
  'Due Soon': { pill: 'border-amber-400/25 bg-amber-500/10', text: 'text-amber-300' },
  Overdue: { pill: 'border-red-400/30 bg-red-500/10', text: 'text-red-300' },
  'Not Required': { pill: 'border-line bg-navy-700/40', text: 'text-ink-faint' },
}

export function MaintenanceStatusBadge({ status }: { status: string }) {
  const s = MAINT_STATUS_STYLES[status] ?? MAINT_STATUS_STYLES['Not Required']
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-lg border px-2 py-1 text-[10.5px] font-semibold',
        s.pill,
        s.text,
      )}
    >
      {status}
    </span>
  )
}

export function MaintenanceRecordStatusBadge({ status }: { status: string }) {
  const s =
    MAINT_STATUS_STYLES[status] ??
    (status === 'Completed'
      ? MAINT_STATUS_STYLES.Completed
      : status === 'In Progress'
        ? MAINT_STATUS_STYLES['In Progress']
        : status === 'Scheduled'
          ? MAINT_STATUS_STYLES.Scheduled
          : MAINT_STATUS_STYLES.Recommended)
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-lg border px-2 py-1 text-[10.5px] font-semibold',
        s.pill,
        s.text,
      )}
    >
      {status}
    </span>
  )
}