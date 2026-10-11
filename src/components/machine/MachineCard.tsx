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

  const statusRail =
    machine.status === 'Critical'
      ? 'linear-gradient(90deg, #f43f5e 0%, #ef4444 35%, #b91c1c 70%, transparent)'
      : machine.status === 'Warning'
        ? 'linear-gradient(90deg, #fbbf24 0%, #f59e0b 35%, #f97316 70%, transparent)'
        : machine.status === 'Operational'
          ? 'linear-gradient(90deg, #10b981 0%, #34d399 35%, #06b6d4 70%, transparent)'
          : 'linear-gradient(90deg, rgba(56, 189, 248, 0.6) 0%, rgba(99, 102, 241, 0.4) 60%, transparent)'

  const isImmediate = (machine.recommendation ?? '').startsWith('Immediate')
  const isNotRequired = machine.recommendation === 'Not Required'

  return (
    <article
      onClick={() => navigate(`/machines/${machine.id}`)}
      className="panel panel-hover group relative min-w-0 cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-1"
    >
      {/* Top accent gradient line */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[1.5px] rounded-t-2xl transition-opacity"
        style={{ backgroundImage: statusRail }}
      />

      {/* Header */}
      <div className="relative flex min-w-0 items-start gap-3 px-3.5 pt-3.5 z-10">
        <div className="relative transition-transform duration-300 group-hover:scale-105">
          <MachineVisual type={machine.type} size={48} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <h3 className="font-mono text-[12px] font-bold tracking-tight text-ink group-hover:text-white transition-colors">
              {machine.id}
            </h3>
            <span className="max-w-full truncate rounded bg-navy-700/70 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-ink-dim border border-line/40">
              {machine.type}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10.5px] leading-snug text-ink-dim group-hover:text-ink transition-colors">
            {machine.name}
          </p>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
            <div
              title={t('Model status')}
              aria-label={`${t('Model status')}: ${machine.status ?? machine.predictionStatus}`}
            >
              {machine.status ? (
                <MachineStatusBadge
                  status={machine.status}
                  label={t(machine.status)}
                  className="px-1.5 py-0.5 text-[9px]"
                />
              ) : (
                <span className="rounded-full border border-line px-1.5 py-0.5 text-[9px] text-ink-faint">
                  {machine.predictionStatus === 'loading'
                    ? 'Prediction loading'
                    : (machine.predictionError ?? 'ML prediction service unavailable')}
                </span>
              )}
            </div>
            <div
              title={t('Maintenance schedule')}
              aria-label={`${t('Maintenance schedule')}: ${machine.maintenanceStatus}`}
            >
              <MaintenanceStatusBadge
                status={machine.maintenanceStatus}
                label={t(machine.maintenanceStatus)}
                className="px-1.5 py-0.5 text-[9px]"
              />
            </div>
          </div>
        </div>
        <div className="w-14 shrink-0 text-center">
          {machine.healthScore !== null ? (
            <div>
              <CircularHealth
                value={machine.healthScore}
                size={56}
                warningThreshold={thresholds.healthWarning}
                criticalThreshold={thresholds.healthCritical}
                status={machine.prediction?.status}
              />
            </div>
          ) : machine.predictionStatus === 'loading' ? (
            <Loader2 className="m-4 h-5 w-5 animate-spin text-sky-300" />
          ) : (
            <span className="block w-[58px] text-center text-[9px] leading-tight text-red-300">
              ML service
              <br />
              unavailable
            </span>
          )}
        </div>
      </div>

      {/* Exact model inputs */}
      <div className="relative mt-2.5 border-t border-line px-3 pt-2.5 z-10">
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-ink-faint">
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
            <p className="mt-2 text-[9px] text-ink-faint">
              {t('Machine type')}: <span className="font-mono">{modelInputs.type}</span>
            </p>
          </>
        ) : (
          <p className="text-[10px] text-ink-faint">
            {machine.predictionStatus === 'loading'
              ? t('Waiting for model prediction')
              : (machine.predictionError ?? t('Model inputs unavailable'))}
          </p>
        )}
      </div>

      {/* Risk */}
      <div className="relative mt-3 px-3 z-10">
        {machine.failureRisk !== null ? (
          <>
            <RiskBar
              value={machine.failureRisk}
              warningThreshold={thresholds.riskWarning}
              criticalThreshold={thresholds.riskCritical}
            />
            {machine.prediction?.anomaly_score !== null &&
            machine.prediction?.anomaly_flag !== null &&
            machine.prediction ? (
              <p className="mt-2 text-[9px] text-ink-faint">
                {t('Sensor model')}: {(machine.prediction.anomaly_score * 100).toFixed(1)}
                % {t('anomaly')}
                {' · '}
                {t(machine.prediction.anomaly_flag ? 'flagged' : 'not flagged')}
                {' · '}
                {machine.prediction.anomaly_input_reading_count} {t('readings')}
              </p>
            ) : machine.prediction ? (
              <p className="mt-2 text-[9px] text-ink-faint">
                {t(
                  'Sensor anomaly analysis is unavailable for simulated sensor readings.'
                )}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[11px] text-ink-faint">
            {machine.predictionStatus === 'loading'
              ? 'Loading model risk prediction…'
              : (machine.predictionError ?? 'ML prediction service unavailable')}
          </p>
        )}
      </div>

      {/* Recommendation */}
      <div
        className={cx(
          'relative mx-3 mt-2.5 flex min-w-0 items-center gap-2 rounded-xl border p-2 z-10 transition-colors',
          isImmediate
            ? 'border-red-400/35 bg-gradient-to-r from-red-500/15 to-rose-500/10'
            : isNotRequired
              ? 'border-emerald-400/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/5'
              : 'border-amber-400/30 bg-gradient-to-r from-amber-500/10 to-orange-500/5'
        )}
      >
        <span
          className={cx(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ring-1 shadow-sm',
            isImmediate
              ? 'bg-red-500/20 text-red-300 ring-red-400/35'
              : isNotRequired
                ? 'bg-emerald-500/20 text-emerald-300 ring-emerald-400/35'
                : 'bg-amber-500/20 text-amber-300 ring-amber-400/35'
          )}
        >
          <Wrench className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-ink-faint">
            Model Recommendation
          </p>
          <p
            className={cx(
              'mt-0.5 line-clamp-2 break-words text-[10px] leading-snug font-bold',
              isImmediate
                ? 'text-red-300'
                : isNotRequired
                  ? 'text-emerald-300'
                  : 'text-amber-300'
            )}
          >
            {machine.recommendation ??
              (machine.predictionStatus === 'loading'
                ? 'Awaiting model recommendation'
                : (machine.predictionError ?? 'ML prediction service unavailable'))}
          </p>
          {machine.maintenanceStatus === 'Overdue' && (
            <p className="mt-1 text-[10px] font-semibold text-red-300">
              Model condition can be normal while scheduled maintenance is overdue;
              complete or reschedule the task.
            </p>
          )}
        </div>
      </div>

      {/* Likely reason + meta */}
      <div className="relative mt-2 flex items-start justify-between gap-2 px-3 pb-3 z-10">
        <div className="min-w-0 flex-1">
          <p className="text-[8px] font-semibold uppercase tracking-wider text-ink-faint">
            Likely Reason
          </p>
          <p className="mt-0.5 flex items-start gap-1 text-[9px] leading-snug text-ink-dim">
            <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-ink-faint" />
            <span className="truncate">
              {machine.likelihood ??
                (machine.predictionStatus === 'available'
                  ? 'No failure type classified by the model'
                  : machine.predictionStatus === 'loading'
                    ? 'Awaiting model output'
                    : (machine.predictionError ?? 'Unavailable'))}
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
        <span className="mt-3 shrink-0 rounded-lg bg-navy-700/60 p-1 text-ink-faint transition-all duration-200 group-hover:text-sky-300 group-hover:translate-x-0.5 group-hover:bg-sky-500/20">
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </article>
  )
}
