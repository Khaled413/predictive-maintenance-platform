import { useNavigate } from 'react-router-dom'
import { ChevronRight, MapPin, Wrench } from 'lucide-react'
import type { Machine } from '../../types'
import MachineVisual from '../ui/MachineVisual'
import CircularHealth from '../ui/CircularHealth'
import RiskBar from '../ui/RiskBar'
import SensorList from '../ui/SensorList'
import { MachineStatusBadge, MaintenanceStatusBadge } from '../ui/Badges'
import { formatDate, cx } from '../../utils/helpers'

export default function MachineCard({ machine }: { machine: Machine }) {
  const navigate = useNavigate()

  return (
    <article
      onClick={() => navigate(`/machines/${machine.id}`)}
      className="panel panel-hover group cursor-pointer"
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <MachineVisual type={machine.type} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-[13px] font-bold tracking-tight text-ink">
              {machine.id}
            </h3>
            <span className="rounded bg-navy-700/70 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-dim">
              {machine.type}
            </span>
          </div>
          <p className="mt-1 truncate text-[11.5px] text-ink-dim">{machine.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <MachineStatusBadge status={machine.status} />
            <MaintenanceStatusBadge status={machine.maintenanceStatus} />
          </div>
        </div>
        <div className="shrink-0">
          <CircularHealth value={machine.healthScore} size={58} />
        </div>
      </div>

      {/* Sensors */}
      <div className="mt-3.5 border-t border-line px-4 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          Key Sensors · Current
        </p>
        <SensorList sensors={machine.sensors} compact />
      </div>

      {/* Risk */}
      <div className="mt-4 px-4">
        <RiskBar value={machine.failureRisk} />
      </div>

      {/* Recommendation */}
      <div className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/12 ring-1 ring-sky-400/25">
          <Wrench className="h-3.5 w-3.5 text-sky-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Recommended Maintenance
          </p>
          <p
            className={cx(
              'mt-0.5 truncate text-[12px] font-semibold',
              machine.recommendation.startsWith('Immediate')
                ? 'text-red-300'
                : machine.recommendation === 'Not Required'
                  ? 'text-emerald-300'
                  : 'text-amber-300',
            )}
          >
            {machine.recommendation}
          </p>
        </div>
      </div>

      {/* Likely reason + meta */}
      <div className="mt-2.5 flex items-start justify-between gap-3 px-1 pb-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Likely Reason
          </p>
          <p className="mt-0.5 flex items-start gap-1.5 text-[11px] leading-snug text-ink-dim">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" />
            <span className="truncate">{machine.likelihood}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Last Maint.
          </p>
          <p className="mt-0.5 flex items-center gap-1 font-mono text-[10.5px] text-ink-faint">
            {formatDate(machine.lastMaintenance)}
          </p>
        </div>
        <span className="mt-3 shrink-0 rounded-lg bg-navy-700/50 p-1 text-ink-faint transition-colors group-hover:text-sky-300">
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </article>
  )
}