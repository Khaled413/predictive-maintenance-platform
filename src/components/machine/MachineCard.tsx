import { useNavigate } from 'react-router-dom'
import { ChevronRight, MapPin, Wrench, Loader2 } from 'lucide-react'
import type { Machine } from '../../types'
import MachineVisual from '../ui/MachineVisual'
import CircularHealth from '../ui/CircularHealth'
import RiskBar from '../ui/RiskBar'
import ModelInputBars from '../ui/ModelInputBars'
import { MachineStatusBadge, MaintenanceStatusBadge } from '../ui/Badges'
import { formatDate, cx } from '../../utils/helpers'
import { useApp } from '../../context/AppContext'
import { usePreferences } from '../../context/PreferencesContext'

export default function MachineCard({ machine }: { machine: Machine }) {
  const navigate = useNavigate()
  const { t } = usePreferences()
  const { thresholds } = useApp()
  const modelInputs = machine.prediction?.inputs ?? machine.predictionInputs

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
            {machine.status ? (
              <MachineStatusBadge status={machine.status} />
            ) : (
              <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-ink-faint">
                {machine.predictionStatus === 'loading'
                  ? 'Prediction loading'
                  : machine.predictionError ?? 'ML prediction service unavailable'}
              </span>
            )}
            <MaintenanceStatusBadge status={machine.maintenanceStatus} />
          </div>
        </div>
        <div className="shrink-0">
          {machine.healthScore !== null ? (
            <div className="text-center">
              <CircularHealth
                value={machine.healthScore}
                size={58}
                warningThreshold={thresholds.healthWarning}
                criticalThreshold={thresholds.healthCritical}
                status={machine.prediction?.status}
              />
              <p className="mt-0.5 text-[8px] text-ink-faint">
                {t('Model health / status')}
              </p>
            </div>
          ) : machine.predictionStatus === 'loading' ? (
            <Loader2 className="m-4 h-5 w-5 animate-spin text-sky-300" />
          ) : (
            <span className="block w-[58px] text-center text-[9px] leading-tight text-red-300">ML service<br />unavailable</span>
          )}
        </div>
      </div>

      {/* Exact model inputs */}
      <div className="mt-3.5 border-t border-line px-4 pt-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
          {t('Inputs used by failure model')}
        </p>
        {modelInputs ? (
          <>
            {machine.predictionStatus === 'loading' && (
              <p className="mb-2 text-[9px] leading-snug text-ink-faint">
                {t('New readings are being evaluated by the trained models.')}
              </p>
            )}
            <ModelInputBars inputs={modelInputs} />
            <p className="mt-2 text-[8px] text-ink-faint">
              {t('Machine type')}: <span className="font-mono">{modelInputs.type}</span>
            </p>
          </>
        ) : (
          <p className="text-[10px] text-ink-faint">
            {machine.predictionStatus === 'loading'
              ? t('Waiting for model prediction')
              : machine.predictionError ?? t('Model inputs unavailable')}
          </p>
        )}
      </div>

      {/* Risk */}
      <div className="mt-4 px-4">
        {machine.failureRisk !== null ? (
          <>
            <RiskBar
              value={machine.failureRisk}
              warningThreshold={thresholds.riskWarning}
              criticalThreshold={thresholds.riskCritical}
            />
            {machine.prediction && (
              <p className="mt-2 text-[9px] text-ink-faint">
                {t('Sensor model')}: {(machine.prediction.anomaly_score * 100).toFixed(1)}% {t('anomaly')}
                {' · '}
                {t(machine.prediction.anomaly_flag ? 'flagged' : 'not flagged')}
                {' · '}
                {machine.prediction.anomaly_input_reading_count} {t('readings')}
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-ink-faint">
            {machine.predictionStatus === 'loading'
              ? 'Loading model risk prediction…'
              : machine.predictionError ?? 'ML prediction service unavailable'}
          </p>
        )}
      </div>

      {/* Recommendation */}
      <div className="mt-3.5 flex items-center gap-2.5 rounded-xl border border-line bg-navy-900/50 px-3 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/12 ring-1 ring-sky-400/25">
          <Wrench className="h-3.5 w-3.5 text-sky-300" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Model Recommendation
          </p>
          <p
            className={cx(
              'mt-0.5 truncate text-[12px] font-semibold',
              (machine.recommendation ?? '').startsWith('Immediate')
                ? 'text-red-300'
                : machine.recommendation === 'Not Required'
                  ? 'text-emerald-300'
                  : 'text-amber-300',
            )}
          >
            {machine.recommendation ??
              (machine.predictionStatus === 'loading'
                ? 'Awaiting model recommendation'
                : machine.predictionError ?? 'ML prediction service unavailable')}
          </p>
          {machine.maintenanceStatus === 'Overdue' && (
                <p className="mt-1 text-[10px] font-semibold text-red-300">
                  Maintenance is overdue. Schedule status is separate from this model recommendation.
                </p>
          )}
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
            <span className="truncate">
              {machine.likelihood ??
                (machine.predictionStatus === 'available'
                  ? 'No failure type classified by the model'
                  : machine.predictionStatus === 'loading'
                    ? 'Awaiting model output'
                    : machine.predictionError ?? 'Unavailable')}
            </span>
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