import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  Factory,
  Gauge,
  RefreshCw,
  Search,
  Timer,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import KpiCard from '../components/ui/KpiCard'
import MachineCard from '../components/machine/MachineCard'
import EmptyState from '../components/ui/EmptyState'
import { SelectInput, TextInput } from '../components/ui/Field'
import { healthTone } from '../utils/helpers'
import type { Machine } from '../types'
import {
  durationHours,
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
  const [machineSearch, setMachineSearch] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const machinesWithStatus: Machine[] = machines

  const kpis = useMemo(() => {
    const total = machinesWithStatus.length
    const actualPredictions = machinesWithStatus.filter(hasProvidedPrediction)
    const demoPredictions = machinesWithStatus.filter(
      (machine) =>
        machine.predictionStatus === 'available' &&
        machine.healthScore !== null &&
        machine.failureRisk !== null &&
        machine.prediction?.machine_input_source === 'simulated' &&
        machine.prediction.sensor_input_source === 'simulated'
    )
    const useDemoPredictions =
      actualPredictions.length === 0 && demoPredictions.length > 0
    const predicted = useDemoPredictions ? demoPredictions : actualPredictions
    const atRisk = predicted.filter(
      (machine) => machine.status === 'Critical' || machine.status === 'Warning'
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
    const actualUpcoming = maintenance.filter(
      (record) => !record.isDemo && isUpcoming(record)
    )
    const demoUpcoming = maintenance.filter(
      (record) => record.isDemo && isUpcoming(record)
    )
    const useDemoUpcoming = actualUpcoming.length === 0 && demoUpcoming.length > 0
    const upcoming = useDemoUpcoming ? demoUpcoming.length : actualUpcoming.length
    const avgHealth = predicted.length
      ? Math.round(
          predicted.reduce((acc, machine) => acc + (machine.healthScore ?? 0), 0) /
            predicted.length
        )
      : null
    const sampleWorkDurations = maintenance
      .filter((record) => record.isDemo && record.status === 'Completed')
      .map((record) => durationHours(record.downtime))
      .filter((value): value is number => value !== null)
    const sampleWorkDurationHours = sampleWorkDurations.reduce(
      (sum, value) => sum + value,
      0
    )
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
    [machines]
  )

  const filtered = machinesWithStatus.filter((m) => {
    const query = machineSearch.trim().toLowerCase()
    if (
      query &&
      ![m.id, m.name, m.type, m.manufacturer, m.model].some((value) =>
        value.toLowerCase().includes(query)
      )
    )
      return false
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
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Total Machines"
          value={kpis.total}
          icon={<Factory className="h-4 w-4" />}
          tone="blue"
          sub="Registered equipment"
          onClick={() => navigate('/machines')}
        />
        <KpiCard
          label={t(
            kpis.useDemoPredictions ? 'Demo Machines at Risk' : 'Machines at Risk'
          )}
          value={kpis.predictionCount > 0 ? kpis.atRisk : '—'}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={kpis.predictionCount === 0 ? 'gray' : kpis.atRisk > 0 ? 'red' : 'green'}
          delta={
            kpis.predictionCount > 0
              ? `${kpis.predictionCount}/${kpis.total} ${t(kpis.useDemoPredictions ? 'simulated model predictions' : 'live-input predictions')}`
              : t('No model predictions available')
          }
          onClick={() => navigate('/alerts')}
        />
        <KpiCard
          label={t(
            kpis.useDemoUpcoming ? 'Demo Upcoming Maintenance' : 'Upcoming Maintenance'
          )}
          value={kpis.upcoming}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="amber"
          sub={t(
            kpis.useDemoUpcoming
              ? 'Sample work orders due in the next 14 days'
              : 'Next 14 days'
          )}
          onClick={() => navigate('/maintenance')}
        />
        <KpiCard
          label={t(
            kpis.useDemoPredictions ? 'Demo Avg. Model Health Score' : 'Avg. Health Score'
          )}
          value={kpis.avgHealth !== null ? `${kpis.avgHealth}%` : '—'}
          icon={<Gauge className="h-4 w-4" />}
          tone={
            kpis.avgHealth === null
              ? 'gray'
              : healthTone(kpis.avgHealth) === 'ok'
                ? 'green'
                : healthTone(kpis.avgHealth) === 'warn'
                  ? 'amber'
                  : 'red'
          }
          sub={
            kpis.avgHealth === null
              ? t('No model predictions available')
              : t(
                  kpis.useDemoPredictions
                    ? 'Model output from simulated inputs'
                    : healthTone(kpis.avgHealth) === 'ok'
                      ? 'Fleet healthy'
                      : 'Monitor closely'
                )
          }
          onClick={() => navigate('/reports')}
        />
        <KpiCard
          label={t(
            kpis.useDemoDowntime ? 'Demo Completed-Work Duration' : 'Recorded Downtime'
          )}
          value={
            kpis.downtimeHours === null ? 'N/A' : `${kpis.downtimeHours.toFixed(1)}h`
          }
          icon={<Timer className="h-4 w-4" />}
          tone="gray"
          sub={
            kpis.useDemoDowntime
              ? t('Sample completed-work duration; not measured machine downtime')
              : t(
                  kpis.downtimeHours === null
                    ? 'No actual completed-work downtime recorded'
                    : 'Completed work orders'
                )
          }
          onClick={() => navigate('/reports')}
        />
      </div>

      {/* Filters */}
      <div className="panel flex flex-wrap items-center gap-2.5 p-3">
        <div className="relative min-w-[min(100%,16rem)] flex-[2_1_16rem]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <TextInput
            value={machineSearch}
            onChange={(event) => setMachineSearch(event.target.value)}
            placeholder="Search by Machine ID, name or type…"
            aria-label="Search machines"
            className="h-9 pl-9 text-[12px]"
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_auto] flex-wrap items-center gap-2">
          <SelectInput
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="min-w-0 flex-1 text-[12px] sm:flex-none sm:min-w-36"
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
            className="min-w-0 flex-1 text-[12px] sm:flex-none sm:min-w-32"
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
          className="btn-primary w-full shrink-0 sm:ml-auto sm:w-auto"
          onClick={handleRegenerateDemoReadings}
          disabled={
            machines.some(
              (machine) =>
                machine.predictionInputs?.machine_input_source === 'simulated' &&
                machine.predictionStatus === 'loading'
            ) || isRegenerating
          }
        >
          <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
          {t(
            isRegenerating
              ? 'Recalculating with trained models'
              : 'Generate new demo readings'
          )}
        </button>
      </div>

      {/* Machine grid */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No machines match your filters"
          message="Try adjusting the machine type, status or search query."
        />
      ) : (
        <div className="machine-card-grid">
          {filtered.map((m) => (
            <MachineCard key={m.id} machine={m} />
          ))}
        </div>
      )}
    </div>
  )
}
