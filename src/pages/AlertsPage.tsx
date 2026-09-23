import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertOctagon,
  BellRing,
  CheckCheck,
  ChevronRight,
  Eye,
  Info,
  ShieldCheck,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { SeverityBadge } from '../components/ui/Badges'
import EmptyState from '../components/ui/EmptyState'
import { cx, severityClasses, timeAgo } from '../utils/helpers'
import type { Severity } from '../types'

const SEVERITY_ICON: Record<Severity, React.ComponentType<{ className?: string }>> = {
  critical: AlertOctagon,
  warning: AlertOctagon,
  info: Info,
  success: CheckCheck,
}

const FILTERS: (Severity | 'all')[] = ['all', 'critical', 'warning', 'info']

/**
 * Quality-defect alerts deep-link into the AI Quality Inspection module,
 * every other alert opens the machine profile it belongs to.
 */
const isQualityAlert = (type: string) => /quality|defect/i.test(type)


export default function AlertsPage() {
  const { alerts, setAlertStatus, addAlert, notify, refreshTimestamp } = useApp()
  const navigate = useNavigate()

  const [filter, setFilter] = useState<Severity | 'all'>('all')
  const [resolvedHidden, setResolvedHidden] = useState(true)

  const counts = useMemo((): Record<Severity | 'all', number> => {
    const bySeverity = (s: Severity) => alerts.filter((a) => a.severity === s).length
    return {
      all: alerts.length,
      critical: bySeverity('critical'),
      warning: bySeverity('warning'),
      info: bySeverity('info'),
      success: bySeverity('success'),
    }
  }, [alerts])

  const list = alerts
    .filter((a) => filter === 'all' || a.severity === filter)
    .filter((a) => !resolvedHidden || a.status !== 'resolved')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex rounded-xl border border-line bg-navy-900/50 p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all',
                filter === f ? 'bg-sky-500/15 text-sky-300' : 'text-ink-dim hover:bg-navy-800 hover:text-ink',
              )}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              <span
                className={cx(
                  'rounded-md bg-navy-700/80 px-1.5 font-mono text-[9.5px]',
                  filter === f ? 'text-sky-300' : 'text-ink-faint',
                )}
              >
                {counts[f]}
              </span>
            </button>
          ))}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[11.5px] text-ink-dim">
          <input
            type="checkbox"
            checked={resolvedHidden}
            onChange={(e) => setResolvedHidden(e.target.checked)}
            className="h-3.5 w-3.5 accent-sky-500"
          />
          Hide resolved alerts
        </label>
        <div className="ml-auto">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              const id = `AL-${String(Date.now() % 10000).padStart(4, '0')}`
              addAlert({
                id,
                machineId: 'M-003',
                machineName: 'Compressor — Air Supply 1',
                severity: 'warning',
                type: 'Test Alert',
                message: 'Vibration is trending upward again after maintenance.',
                timestamp: new Date().toISOString(),
                status: 'active',
                recommendedAction: 'Monitor vibration for the next 24 hours.',
              })
              refreshTimestamp()
              notify('info', 'Alert created', 'Test alert added to the center.')
            }}
          >
            <BellRing className="h-4 w-4" />
            Simulate Alert
          </button>
        </div>
      </div>
{list.length === 0 ? (
        <EmptyState
          title="No alerts in this view"
          message="All clear — no alerts match the selected filters."
        />
      ) : (
        <div className="space-y-3">
          {list.map((a) => {
            const Icon = SEVERITY_ICON[a.severity]
            const s = severityClasses[a.severity]
            const quality = isQualityAlert(a.type)
            return (
              <article
                key={a.id}
                className={cx(
                  'panel relative overflow-hidden p-4',
                  a.severity === 'critical' && a.status !== 'resolved' ? 'border-red-400/40' : '',
                )}
              >
                <div className="flex items-start gap-3.5">
                  <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1', s.pill)}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-bold text-ink">{a.type}</span>
                      <SeverityBadge severity={a.severity} />
                      <span className="chip">
                        {a.status === 'active'
                          ? '● Active'
                          : a.status === 'acknowledged'
                            ? 'Acknowledged'
                            : 'Resolved'}
                      </span>
                      <span className="ml-auto font-mono text-[10.5px] text-ink-faint">
                        {timeAgo(a.timestamp)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-dim">{a.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => navigate(quality ? '/quality' : `/machines/${a.machineId}`)}
                        className="inline-flex items-center gap-1.5 font-semibold text-sky-300 hover:underline"
                      >
                        {quality ? (
                          <>
                            <Eye className="h-3 w-3" />
                            Open Quality Inspection
                          </>
                        ) : (
                          <>
                            {a.machineId} · {a.machineName}
                          </>
                        )}
                        <ChevronRight className="h-3 w-3" />
                      </button>
                      {quality && (
                        <span className="chip font-mono">
                          {a.machineId} · {a.machineName}
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-sky-400/20 bg-sky-500/5 px-3 py-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
                      <p className="text-[11.5px] leading-relaxed text-ink-dim">
                        <span className="font-semibold text-sky-300/90">Recommended action: </span>
                        {a.recommendedAction}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {a.status === 'active' && (
                      <button
                        type="button"
                        className="btn-ghost btn-sm"
                        onClick={() => {
                          setAlertStatus(a.id, 'acknowledged')
                          notify('info', 'Alert acknowledged', `${a.id} acknowledged by Eng. Sarah.`)
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Acknowledge
                      </button>
                    )}
                    {a.status !== 'resolved' && (
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => {
                          setAlertStatus(a.id, 'resolved')
                          notify('success', 'Alert resolved', `${a.id} marked as resolved.`)
                          refreshTimestamp()
                        }}
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}