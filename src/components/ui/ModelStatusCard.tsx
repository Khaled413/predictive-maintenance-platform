import { Activity, CheckCircle2, CircleAlert } from 'lucide-react'
import type { ModelSystemStatus } from '../../types'
import { timeAgo } from '../../utils/helpers'
import { usePreferences } from '../../context/PreferencesContext'
import Panel, { PanelHeader } from './Panel'

export default function ModelStatusCard({ status }: { status: ModelSystemStatus }) {
  const { t } = usePreferences()

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        title={t('Model / System Status')}
        subtitle={t('Readiness reported by the ML service')}
        right={<Activity className="h-4 w-4 text-sky-300" />}
      />
      <div className="grid gap-3 px-4 pb-4 pt-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ['Failure Model', status.failure_model],
          ['Failure Type Model', status.failure_type_model],
          ['Anomaly Model', status.anomaly_model],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center gap-2 rounded-xl border border-line bg-navy-900/40 px-3 py-2">
            {value === 'ready' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
            ) : (
              <CircleAlert className="h-4 w-4 shrink-0 text-amber-300" />
            )}
            <div className="min-w-0">
              <p className="truncate text-[10px] text-ink-faint">{t(label)}</p>
              <p className="text-[11px] font-semibold text-ink">{t(value === 'ready' ? 'Ready' : 'Unavailable')}</p>
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-line bg-navy-900/40 px-3 py-2">
          <p className="text-[10px] text-ink-faint">{t('Model Version')}</p>
          <p className="mt-0.5 font-mono text-[11px] font-semibold text-ink">
            {status.model_version ?? t('Not available')}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-navy-900/40 px-3 py-2">
          <p className="text-[10px] text-ink-faint">{t('Last Prediction')}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-ink">
            {status.last_prediction_at ? timeAgo(status.last_prediction_at) : t('Not available')}
          </p>
        </div>
      </div>
    </Panel>
  )
}
