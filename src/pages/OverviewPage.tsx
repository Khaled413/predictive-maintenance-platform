import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  Factory,
  Gauge,
  LineChart as LineChartIcon,
  RefreshCw,
  Timer,
} from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../context/AppContext'
import KpiCard from '../components/ui/KpiCard'
import MachineCard from '../components/machine/MachineCard'
import EmptyState from '../components/ui/EmptyState'
import { SelectInput } from '../components/ui/Field'
import { healthTone } from '../utils/helpers'
import type { Machine } from '../types'
import Panel, { PanelHeader } from '../components/ui/Panel'
import { ChartTooltip } from '../components/ui/ChartCard'
import {
  fleetHealth,
  DASHBOARD_TREND_DAYS,
  durationHours,
  healthTrendDirection,
  operationalKpis,
  hasProvidedPrediction,
} from '../utils/operationalMetrics'
import { usePreferences } from '../context/PreferencesContext'

export default function OverviewPage() {
  const { machines, maintenance, regenerateDemoReadings } = useApp()
  const navigate = useNavigate()
  const { t } = usePreferences()

  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [isRegenerating, setIsRegenerating] = useState(false)

  const machinesWithStatus: Machine[] = machines
  const fleet = useMemo(() => fleetHealth(machinesWithStatus), [machinesWithStatus])
  const trend = useMemo(() => {
    const cutoff = Date.now() - DASHBOARD_TREND_DAYS * 86_400_000
    const byDay = new Map<string, number[]>()
    machinesWithStatus.forEach((machine) => {
      machine.history.forEach((point) => {
        if (point.isDemo) return
        const time = Date.parse(point.date)
        if (!Number.isFinite(time) || time < cutoff) return
        const key = new Date(time).toISOString().slice(0, 10)
        byDay.set(key, [...(byDay.get(key) ?? []), point.health])
      })
    })
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, values]) => ({
        date,
        health: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      }))
  }, [machinesWithStatus])
  const trendDirection = healthTrendDirection(trend)

  const kpis = useMemo(() => {
    const total = machinesWithStatus.length
    const actualPredictions = machinesWithStatus.filter(hasProvidedPrediction)
    const demoPredictions = machinesWithStatus.filter(
      (machine) => machine.predictionStatus === 'available' &&
        machine.healthScore !== null &&
        machine.failureRisk !== null &&
        machine.prediction?.machine_input_source === 'simulated' &&
        machine.prediction.sensor_input_source === 'simulated',
    )
    const useDemoPredictions = actualPredictions.length === 0 && demoPredictions.length > 0
    const predicted = useDemoPredictions ? demoPredictions : actualPredictions
    const atRisk = predicted.filter(
      (machine) => machine.status === 'Critical' || machine.status === 'Warning',
    ).length
    const now = Date.now()
    const isUpcoming = (r: (typeof maintenance)[number]) => {
      const d = new Date(r.date).getTime()
      return (
        (r.status === 'Scheduled' || r.status === 'Recommended') &&
        d >= now &&
        d <= now + 14 * 86_400_000
      )
    }
    const actualUpcoming = maintenance.filter((record) => !record.isDemo && isUpcoming(record))
    const demoUpcoming = maintenance.filter((record) => record.isDemo && isUpcoming(record))
    const useDemoUpcoming = actualUpcoming.length === 0 && demoUpcoming.length > 0
    const upcoming = useDemoUpcoming ? demoUpcoming.length : actualUpcoming.length
    const avgHealth = predicted.length
      ? Math.round(predicted.reduce((acc, machine) => acc + (machine.healthScore ?? 0), 0) / predicted.length)
      : null
    const sampleWorkDurations = maintenance
      .filter((record) => record.isDemo && record.status === 'Completed')
      .map((record) => durationHours(record.downtime))
      .filter((value): value is number => value !== null)
    const sampleWorkDurationHours = sampleWorkDurations.reduce((sum, value) => sum + value, 0)
    const actualDowntimeHours = operationalKpis(maintenance).downtimeHours
    const useDemoDowntime = actualDowntimeHours === null && sampleWorkDurationHours > 0
    return {
      total,
      atRisk,
      upcoming,
      avgHealth,
      predictedCount: predicted.length,
      predictionCount: predicted.length,
      useDemoPredictions,
      useDemoUpcoming,
      downtimeHours: useDemoDowntime ? sampleWorkDurationHours : actualDowntimeHours,
      useDemoDowntime,
    }
  }, [machinesWithStatus, maintenance])

  const types = useMemo(
    () => ['All', ...Array.from(new Set(machines.map((m) => m.type)))],
    [machines],
  )

  const filtered = machinesWithStatus.filter((m) => {
    if (typeFilter !== 'All' && m.type !== typeFilter) return false
    if (statusFilter !== 'All' && m.status !== statusFilter) return false
    return true
  })
  const handleRegenerateDemoReadings = async () => {
    setIsRegenerating(true)
    try {
      await regenerateDemoReadings()
    } finally {
      setIsRegenerating(false)
    }
  }
  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total Machines"
          value={kpis.total}
          icon={<Factory className="h-4 w-4" />}
          tone="blue"
          sub="Registered equipment"
          onClick={() => navigate('/machines')}
        />
        <KpiCard
          label={t(kpis.useDemoPredictions ? 'Demo Machines at Risk' : 'Machines at Risk')}
          value={kpis.predictionCount > 0 ? kpis.atRisk : '—'}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={kpis.predictionCount === 0 ? 'gray' : kpis.atRisk > 0 ? 'red' : 'green'}
          delta={kpis.predictionCount > 0
            ? `${kpis.predictionCount}/${kpis.total} ${t(kpis.useDemoPredictions ? 'simulated model predictions' : 'live-input predictions')}`
            : t('No model predictions available')}
          onClick={() => navigate('/alerts')}
        />
        <KpiCard
          label={t(kpis.useDemoUpcoming ? 'Demo Upcoming Maintenance' : 'Upcoming Maintenance')}
          value={kpis.upcoming}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="amber"
          sub={t(kpis.useDemoUpcoming ? 'Sample work orders due in the next 14 days' : 'Next 14 days')}
          onClick={() => navigate('/maintenance')}
        />
        <KpiCard
          label={t(kpis.useDemoPredictions ? 'Demo Avg. Model Health Score' : 'Avg. Health Score')}
          value={kpis.avgHealth !== null ? `${kpis.avgHealth}%` : '—'}
          icon={<Gauge className="h-4 w-4" />}
          tone={kpis.avgHealth === null ? 'gray' :
            healthTone(kpis.avgHealth) === 'ok'
              ? 'green'
              : healthTone(kpis.avgHealth) === 'warn'
                ? 'amber'
                : 'red'
          }
          sub={kpis.avgHealth === null
            ? t('No model predictions available')
            : t(kpis.useDemoPredictions
              ? 'Model output from simulated inputs'
              : healthTone(kpis.avgHealth) === 'ok' ? 'Fleet healthy' : 'Monitor closely')}
          onClick={() => navigate('/reports')}
        />
        <KpiCard
          label={t(kpis.useDemoDowntime ? 'Demo Completed-Work Duration' : 'Recorded Downtime')}
          value={kpis.downtimeHours === null ? 'N/A' : `${kpis.downtimeHours.toFixed(1)}h`}
          icon={<Timer className="h-4 w-4" />}
          tone="gray"
          sub={kpis.useDemoDowntime
            ? t('Sample completed-work duration; not measured machine downtime')
            : t(kpis.downtimeHours === null ? 'No actual completed-work downtime recorded' : 'Completed work orders')}
          onClick={() => navigate('/reports')}
        />
      </div>

      {(fleet.availableCount > 0 || trend.length > 1) && (
        <div className={`grid gap-4 ${fleet.availableCount > 0 && trend.length > 1 ? 'xl:grid-cols-2' : 'xl:grid-cols-1'}`}>
          {fleet.availableCount > 0 && (
            <Panel className="overflow-hidden">
              <PanelHeader
                title={t('Fleet Health')}
                subtitle={t('Only predictions using provided machine and sensor inputs; simulated-input outputs are excluded.')}
              />
              <div className="grid gap-4 px-4 pb-4 pt-3 sm:grid-cols-[auto_1fr] sm:items-center">
                <div className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-[6px] border-sky-400/50">
                  <span className="font-mono text-xl font-bold text-ink">
                    {fleet.averageHealth === null ? '—' : `${fleet.averageHealth}%`}
                  </span>
                  <span className="text-[9px] text-ink-faint">{t('Fleet average')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    [t('Machines'), `${fleet.availableCount}/${fleet.totalCount}`],
                    [t('Healthy'), fleet.healthy],
                    [t('Warning'), fleet.warning],
                    [t('Critical'), fleet.critical],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-line bg-navy-900/40 px-3 py-2">
                      <p className="text-ink-faint">{label}</p>
                      <p className="mt-0.5 font-mono font-bold text-ink">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
          )}

          {trend.length > 1 && (
            <Panel className="overflow-hidden">
              <PanelHeader
                title={t('Health Trend — Last 7 Days')}
                subtitle={`${t('Trend')}: ${t(trendDirection)}`}
                right={<LineChartIcon className="h-4 w-4 text-sky-300" />}
              />
              <div className="h-40 px-2 pb-3 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,0.1)" vertical={false} />
                    <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={9} />
                    <YAxis domain={[0, 100]} tickLine={false} axisLine={false} width={30} fontSize={9} />
                    <Tooltip content={<ChartTooltip formatter={(value: number) => `${value}%`} />} />
                    <Line type="monotone" dataKey="health" name={t('Health')} stroke="#38BDF8" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2.5">
          <SelectInput
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-auto min-w-36"
            aria-label="Machine type filter"
          >
            {types.map((t) => (
              <option key={t} value={t}>
                {t === 'All' ? 'Machine Type: All' : t}
              </option>
            ))}
          </SelectInput>
          <SelectInput
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-auto min-w-32"
            aria-label="Status filter"
          >
            {['All', 'Operational', 'Warning', 'Critical'].map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'Status: All' : s}
              </option>
            ))}
          </SelectInput>
        </div>
        <span className="shrink-0 rounded-lg border border-line bg-navy-800/60 px-2.5 py-1.5 font-mono text-[11px] text-ink-dim">
          {filtered.length} / {machines.length} machines
        </span>
        <button
          type="button"
          className="btn-primary shrink-0"
          onClick={handleRegenerateDemoReadings}
          disabled={machines.some((machine) =>
            machine.predictionInputs?.machine_input_source === 'simulated' &&
            machine.predictionStatus === 'loading',
          ) || isRegenerating}
        >
          <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
          {t(isRegenerating ? 'Recalculating with trained models' : 'Generate new demo readings')}
        </button>
      </div>

      {/* Machine grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No machines match your filters"
          message="Try adjusting the machine type, status or search query."
        />
      ) : (
        <div className="card-grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((m) => (
            <MachineCard key={m.id} machine={m} />
          ))}
        </div>
      )}
    </div>
  )
}