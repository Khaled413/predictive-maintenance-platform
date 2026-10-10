import React, { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Gauge,
  Layers,
  Timer,
  Wrench,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import KpiCard from '../components/ui/KpiCard'
import { ChartCard, ChartTooltip } from '../components/ui/ChartCard'
import { SelectInput } from '../components/ui/Field'
import EmptyState from '../components/ui/EmptyState'
import { cx, formatInt, healthTone, riskTone } from '../utils/helpers'
import {
  durationHours,
  hasProvidedPrediction,
  operationalKpis,
} from '../utils/operationalMetrics'
import Panel, { PanelHeader } from '../components/ui/Panel'
import { usePreferences } from '../context/PreferencesContext'

type RangeKey = '7d' | '30d' | '3m' | 'custom'
type SectionKey = 'overview' | 'health' | 'risk' | 'downtime' | 'maintenance' | 'quality'
type ReportDataMode = 'demo' | 'actual'

const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
  { key: '3m', label: 'Last 3 Months' },
  { key: 'custom', label: 'Custom Range' },
]

const SECTIONS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'All Analytics', icon: <Layers className="h-3.5 w-3.5" /> },
  { key: 'health', label: 'Machine Health', icon: <Gauge className="h-3.5 w-3.5" /> },
  { key: 'risk', label: 'Failure Risk', icon: <AlertTriangle className="h-3.5 w-3.5" /> },
  { key: 'downtime', label: 'Downtime', icon: <Timer className="h-3.5 w-3.5" /> },
  { key: 'maintenance', label: 'Maintenance', icon: <Wrench className="h-3.5 w-3.5" /> },
  { key: 'quality', label: 'Quality', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
]

const RISK_BANDS = [
  { label: '0–25%', min: 0, max: 25, color: '#34D399' },
  { label: '26–50%', min: 26, max: 50, color: '#60A5FA' },
  { label: '51–70%', min: 51, max: 70, color: '#FBBF24' },
  { label: '71–85%', min: 71, max: 85, color: '#FB923C' },
  { label: '86–100%', min: 86, max: 100, color: '#F87171' },
]

export default function ReportsPage() {
  const { machines, maintenance, inspections, notify } = useApp()
  const { t } = usePreferences()

  const [range, setRange] = useState<RangeKey>('30d')
  const [section, setSection] = useState<SectionKey>('overview')
  const [dataMode, setDataMode] = useState<ReportDataMode>('demo')
  const [customFrom, setCustomFrom] = useState(
    new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)
  )
  const [customTo, setCustomTo] = useState(new Date().toISOString().slice(0, 10))
  const [machineFilter, setMachineFilter] = useState('All')

  const { start, end } = useMemo(() => {
    if (range === 'custom') {
      return {
        start: new Date(`${customFrom}T00:00:00`).getTime(),
        end: new Date(`${customTo}T23:59:59`).getTime(),
      }
    }
    return { start: Date.now() - RANGE_DAYS[range] * 86_400_000, end: Date.now() }
  }, [range, customFrom, customTo])

  /** Inclusive timestamp test for the active reporting window. */
  const inRange = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= start && t <= end
  }

  const scopedMachines = useMemo(
    () =>
      machineFilter === 'All' ? machines : machines.filter((m) => m.id === machineFilter),
    [machines, machineFilter]
  )
  const scopedMachineIds = new Set(scopedMachines.map((machine) => machine.id))
  const isDemoMode = dataMode === 'demo'
  const includesRecord = (isDemo: boolean | undefined) => Boolean(isDemo) === isDemoMode
  const hasReportPrediction = (machine: (typeof scopedMachines)[number]) =>
    isDemoMode
      ? machine.predictionStatus === 'available' &&
        machine.healthScore !== null &&
        machine.failureRisk !== null &&
        machine.prediction?.machine_input_source === 'simulated' &&
        machine.prediction.sensor_input_source === 'simulated'
      : hasProvidedPrediction(machine)
  const reportHealthFor = (machine: (typeof scopedMachines)[number]) =>
    machine.healthScore
  const reportStatusFor = (machine: (typeof scopedMachines)[number]) => machine.status
  const predictedMachines = scopedMachines.filter((machine) =>
    hasReportPrediction(machine)
  )

  const rangeLabel =
    range === 'custom'
      ? `${customFrom} → ${customTo}`
      : (RANGES.find((r) => r.key === range)?.label ?? '')

  // ------------------------------------------------------------------
  // Aggregations
  // ------------------------------------------------------------------

  const kpis = useMemo(() => {
    const scopedIds = new Set(scopedMachines.map((m) => m.id))
    const records = maintenance.filter(
      (r) =>
        includesRecord(r.isDemo) &&
        scopedIds.has(r.machineId) &&
        inRange(r.date) &&
        r.status !== 'Recommended'
    )
    const completed = records.filter((r) => r.status === 'Completed')
    const downtimeValues = completed
      .map((record) =>
        isDemoMode ? durationHours(record.downtime) : record.actualDowntimeHours
      )
      .filter(
        (value): value is number =>
          value !== null && value !== undefined && Number.isFinite(value)
      )
    const costValues = completed
      .map((record) => (isDemoMode ? record.cost : record.actualCost))
      .filter(
        (value): value is number =>
          value !== null && value !== undefined && Number.isFinite(value)
      )
    const downtime = downtimeValues.length
      ? downtimeValues.reduce((sum, value) => sum + value, 0)
      : null
    const cost = costValues.length
      ? costValues.reduce((sum, value) => sum + value, 0)
      : null
    const insp = inspections.filter(
      (i) => includesRecord(i.isDemo) && inRange(i.timestamp)
    )
    const passed = insp.filter((i) => i.result === 'PASS').length
    const avgHealth = Math.round(
      predictedMachines.reduce((a, m) => a + (reportHealthFor(m) ?? 0), 0) /
        Math.max(1, predictedMachines.length)
    )
    const avgRisk = Math.round(
      predictedMachines.reduce((a, m) => a + (m.failureRisk ?? 0), 0) /
        Math.max(1, predictedMachines.length)
    )
    const anomalyScores = predictedMachines
      .map((machine) => machine.prediction?.anomaly_score)
      .filter((score): score is number => typeof score === 'number')
    const avgAnomalyScore = anomalyScores.length
      ? anomalyScores.reduce((sum, score) => sum + score, 0) / anomalyScores.length
      : null
    const flaggedAnomalyPredictions = predictedMachines.filter(
      (machine) => machine.prediction?.anomaly_flag === true
    ).length
    const avgMttr =
      downtimeValues.length && downtime !== null
        ? (downtime / downtimeValues.length).toFixed(1)
        : null
    const classifiedMaintenance = records.filter(
      (record) =>
        record.maintenanceKind === 'preventive' || record.maintenanceKind === 'corrective'
    )
    const demoFailureCount = isDemoMode
      ? scopedMachines.reduce(
          (sum, machine) =>
            sum +
            machine.events.filter(
              (event) =>
                event.type === 'Failure' &&
                includesRecord(event.isDemo) &&
                inRange(event.date)
            ).length,
          0
        )
      : 0
    const demoOperatingHours = isDemoMode
      ? (Math.max(0, end - start) / 3_600_000) * scopedMachines.length
      : 0
    return {
      avgHealth,
      avgRisk,
      avgAnomalyScore,
      flaggedAnomalyPredictions,
      anomalyPredictionCount: anomalyScores.length,
      downtime,
      cost,
      avgMttr,
      workOrders: records.length,
      qualityRate: insp.length ? Math.round((passed / insp.length) * 100) : 0,
      inspections: insp.length,
      passed,
      operational: {
        ...operationalKpis(records),
        ...(isDemoMode
          ? {
              mtbfHours:
                demoFailureCount > 0 && demoOperatingHours > 0
                  ? demoOperatingHours / demoFailureCount
                  : null,
              failureRate:
                demoOperatingHours > 0
                  ? (demoFailureCount / demoOperatingHours) * 1000
                  : null,
              mttrHours:
                downtimeValues.length && downtime !== null
                  ? downtime / downtimeValues.length
                  : null,
              preventiveMaintenancePercent: classifiedMaintenance.length
                ? (classifiedMaintenance.filter(
                    (record) => record.maintenanceKind === 'preventive'
                  ).length /
                    classifiedMaintenance.length) *
                  100
                : null,
            }
          : {}),
        downtimeHours: downtime,
      },
      demoFailureCount,
      demoOperatingHours,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedMachines, maintenance, inspections, start, end, dataMode])

  /** Fleet-average health & risk trend for the active window. */
  const healthTrend = useMemo(() => {
    if (isDemoMode) return []
    const buckets = new Map<
      string,
      { health: number[]; risk: number[]; anomaly: number[] }
    >()
    scopedMachines.forEach((m) => {
      m.history.forEach((p) => {
        if (!includesRecord(p.isDemo)) return
        if (!inRange(p.date)) return
        const key = dayKey(p.date)
        const b = buckets.get(key) ?? { health: [], risk: [], anomaly: [] }
        b.health.push(p.health)
        b.risk.push(p.risk)
        if (p.anomalyScore !== undefined && Number.isFinite(p.anomalyScore)) {
          b.anomaly.push(p.anomalyScore)
        }
        buckets.set(key, b)
      })
    })
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, b]) => ({
        day: shortDay(key),
        health: Math.round(b.health.reduce((x, y) => x + y, 0) / b.health.length),
        risk: Math.round(b.risk.reduce((x, y) => x + y, 0) / b.risk.length),
        anomaly: b.anomaly.length
          ? Math.round(b.anomaly.reduce((x, y) => x + y, 0) / b.anomaly.length)
          : null,
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedMachines, start, end, dataMode])

  const riskDistribution = RISK_BANDS.map((band) => ({
    band: band.label,
    machines: predictedMachines.filter(
      (machine) =>
        machine.failureRisk !== null &&
        machine.failureRisk >= band.min &&
        machine.failureRisk <= band.max
    ).length,
    color: band.color,
  }))
  const inWindowPredictions = predictedMachines.filter(
    (machine) => machine.prediction && inRange(machine.prediction.timestamp)
  )
  const predictionSnapshotDate = inWindowPredictions.find((machine) => machine.prediction)
    ?.prediction?.timestamp
  const snapshotAnomalyScores = inWindowPredictions.flatMap((machine) =>
    machine.prediction && machine.prediction.anomaly_score !== null
      ? [machine.prediction.anomaly_score * 100]
      : []
  )
  const currentPredictionSnapshot = predictionSnapshotDate
    ? [
        {
          day: shortDay(predictionSnapshotDate),
          health: Math.round(
            inWindowPredictions.reduce(
              (sum, machine) => sum + (reportHealthFor(machine) ?? 0),
              0
            ) / inWindowPredictions.length
          ),
          risk: Math.round(
            inWindowPredictions.reduce(
              (sum, machine) => sum + (machine.failureRisk ?? 0),
              0
            ) / inWindowPredictions.length
          ),
          anomaly: snapshotAnomalyScores.length
            ? Math.round(
                snapshotAnomalyScores.reduce((sum, score) => sum + score, 0) /
                  snapshotAnomalyScores.length
              )
            : null,
        },
      ]
    : []
  const trendForCharts = healthTrend.length ? healthTrend : currentPredictionSnapshot
  const isCurrentSnapshotOnly =
    healthTrend.length === 0 && currentPredictionSnapshot.length > 0

  const downtimeByMachine = useMemo(
    () =>
      scopedMachines
        .map((m) => {
          const recs = maintenance.filter(
            (r) =>
              includesRecord(r.isDemo) &&
              r.machineId === m.id &&
              inRange(r.date) &&
              r.status !== 'Recommended'
          )
          return {
            id: m.id,
            type: m.type,
            hours: Number(
              recs
                .filter((record) => record.status === 'Completed')
                .reduce(
                  (sum, record) =>
                    sum +
                    (isDemoMode
                      ? (durationHours(record.downtime) ?? 0)
                      : (record.actualDowntimeHours ?? 0)),
                  0
                )
                .toFixed(1)
            ),
          }
        })
        .filter((r) => r.hours > 0)
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopedMachines, maintenance, start, end, dataMode]
  )

  const maintenanceByMonth = useMemo(() => {
    const buckets = new Map<
      string,
      { orders: number; completed: number; cost: number; costCount: number }
    >()
    maintenance.forEach((r) => {
      if (
        !includesRecord(r.isDemo) ||
        !scopedMachineIds.has(r.machineId) ||
        !inRange(r.date)
      )
        return
      const key = shortMonth(r.date)
      const b = buckets.get(key) ?? { orders: 0, completed: 0, cost: 0, costCount: 0 }
      b.orders += 1
      if (r.status === 'Completed') {
        b.completed += 1
        const cost = isDemoMode ? r.cost : r.actualCost
        if (cost !== null && cost !== undefined) {
          b.cost += cost
          b.costCount += 1
        }
      }
      buckets.set(key, b)
    })
    return Array.from(buckets.entries()).map(([month, v]) => ({
      month,
      orders: v.orders,
      completed: v.completed,
      cost: v.costCount ? v.cost : null,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenance, start, end, dataMode, scopedMachines])

  const maintenanceByType = useMemo(() => {
    const counts = new Map<string, number>()
    maintenance.forEach((r) => {
      if (
        !includesRecord(r.isDemo) ||
        !scopedMachineIds.has(r.machineId) ||
        !inRange(r.date)
      )
        return
      counts.set(r.type, (counts.get(r.type) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenance, start, end, dataMode, scopedMachines])

  const qualityTrend = useMemo(() => {
    const buckets = new Map<string, { total: number; passed: number }>()
    inspections
      .filter((inspection) => includesRecord(inspection.isDemo))
      .forEach((i) => {
        if (!inRange(i.timestamp)) return
        const key = dayKey(i.timestamp)
        const b = buckets.get(key) ?? { total: 0, passed: 0 }
        b.total += 1
        if (i.result === 'PASS') b.passed += 1
        buckets.set(key, b)
      })
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, b]) => ({
        day: shortDay(key),
        qualityRate: Math.round((b.passed / b.total) * 100),
        defectRate: Math.round(((b.total - b.passed) / b.total) * 100),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspections, start, end, dataMode])

  const defectDistribution = useMemo(() => {
    const counts = new Map<string, number>()
    inspections
      .filter(
        (i) => includesRecord(i.isDemo) && inRange(i.timestamp) && i.result === 'FAIL'
      )
      .forEach((i) => counts.set(i.defectType, (counts.get(i.defectType) ?? 0) + 1))
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspections, start, end, dataMode])

  /** Recorded failures / anomalies / interventions from machine event markers. */
  const failureTrend = useMemo(() => {
    const buckets = new Map<
      string,
      { failures: number; anomalies: number; maintenance: number }
    >()
    scopedMachines.forEach((m) => {
      m.events
        .filter((event) => includesRecord(event.isDemo))
        .forEach((e) => {
          if (!inRange(e.date)) return
          const key = dayKey(e.date)
          const b = buckets.get(key) ?? { failures: 0, anomalies: 0, maintenance: 0 }
          if (e.type === 'Failure') b.failures += 1
          else if (e.type === 'Sensor Anomaly') b.anomalies += 1
          else b.maintenance += 1
          buckets.set(key, b)
        })
    })
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, b]) => ({ day: shortDay(key), ...b }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedMachines, start, end, dataMode])

  const exportReport = (kind: 'PDF' | 'Excel' | 'CSV') => {
    if (kind !== 'CSV') {
      notify(
        'warning',
        `${kind} export unavailable`,
        'Only CSV export is implemented; no file was created.'
      )
      return
    }
    const fields = [
      'Data Mode',
      'Machine ID',
      'Machine',
      'Type',
      'Reported Condition Status',
      'Model Health Score',
      'Model Status',
      'Failure Risk',
      'Sensor Anomaly Score',
      'Sensor Anomaly Flag',
      'Predicted Failure Type',
      'Failure Model Air Temperature (K)',
      'Failure Model Process Temperature (K)',
      'Failure Model Rotational Speed (rpm)',
      'Failure Model Torque (Nm)',
      'Failure Model Tool Wear (min)',
      'Failure Model Type Code',
      'Simulation State',
      'Model Input Source',
      'Prediction Timestamp',
      'Work Orders',
      isDemoMode ? 'Sample Completed-Work Duration (Hours)' : 'Actual Downtime Hours',
      isDemoMode ? 'Sample Completed-Work Cost' : 'Actual Maintenance Cost',
    ]
    const csvCell = (value: string | number) => {
      const text = String(value)
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replace(/"/g, '""')}"`
    }
    const rows = scopedMachines.map((machine) => {
      const prediction = hasReportPrediction(machine) ? machine.prediction : null
      const records = maintenance.filter(
        (record) =>
          includesRecord(record.isDemo) &&
          record.machineId === machine.id &&
          inRange(record.date)
      )
      const completed = records.filter((record) => record.status === 'Completed')
      const downtimeValues = completed
        .map((record) =>
          isDemoMode ? durationHours(record.downtime) : record.actualDowntimeHours
        )
        .filter(
          (value): value is number =>
            value !== null && value !== undefined && Number.isFinite(value)
        )
      const costValues = completed
        .map((record) => (isDemoMode ? record.cost : record.actualCost))
        .filter(
          (value): value is number =>
            value !== null && value !== undefined && Number.isFinite(value)
        )
      return [
        isDemoMode ? 'DEMO — simulated' : 'ACTUAL — recorded',
        machine.id,
        machine.name,
        machine.type,
        prediction ? (reportHealthFor(machine) ?? 'N/A') : 'N/A',
        prediction ? (reportStatusFor(machine) ?? 'Unavailable') : 'Unavailable',
        !prediction || machine.failureRisk === null
          ? 'N/A'
          : Number(machine.failureRisk.toFixed(2)),
        prediction?.anomaly_score !== null && prediction
          ? Number((prediction.anomaly_score * 100).toFixed(2))
          : 'N/A',
        prediction?.anomaly_flag !== null && prediction
          ? prediction.anomaly_flag
            ? 'Yes'
            : 'No'
          : 'N/A',
        prediction?.failure_type ?? 'N/A',
        prediction?.inputs.air_temperature ?? 'N/A',
        prediction?.inputs.process_temperature ?? 'N/A',
        prediction?.inputs.rotational_speed ?? 'N/A',
        prediction?.inputs.torque ?? 'N/A',
        prediction?.inputs.tool_wear ?? 'N/A',
        prediction?.inputs.type ?? 'N/A',
        prediction?.inputs.simulation_state ?? 'N/A',
        prediction?.machine_input_source ?? 'N/A',
        prediction?.timestamp ?? 'N/A',
        records.length,
        downtimeValues.length
          ? downtimeValues.reduce((sum, value) => sum + value, 0)
          : 'N/A',
        costValues.length ? costValues.reduce((sum, value) => sum + value, 0) : 'N/A',
      ]
    })
    const content = `\uFEFF${[fields, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`
    const url = URL.createObjectURL(
      new Blob([content], { type: 'text/csv;charset=utf-8' })
    )
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `Reports_${isDemoMode ? 'demo' : 'actual'}_${range}.csv`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    notify(
      'success',
      'CSV export downloaded',
      `${rangeLabel} · ${scopedMachines.length} machines · ${kpis.workOrders} work orders`
    )
  }

  const showHealth = section === 'overview' || section === 'health' || section === 'risk'
  const showRisk = section === 'overview' || section === 'risk'
  const showDowntime = section === 'overview' || section === 'downtime'
  const showMaintenance = section === 'overview' || section === 'maintenance'
  const showQuality = section === 'overview' || section === 'quality'
  const hasData =
    kpis.workOrders > 0 ||
    kpis.inspections > 0 ||
    healthTrend.length > 0 ||
    predictedMachines.length > 0
  return (
    <div className="space-y-5">
      <div
        className={cx(
          'flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between',
          isDemoMode
            ? 'border-amber-400/25 bg-amber-500/5'
            : 'border-sky-400/15 bg-sky-500/5'
        )}
      >
        <p className="text-[10.5px] leading-relaxed text-ink-faint">
          {isDemoMode
            ? t(
                'Demo reports use reproducible sample records and simulated model inputs. They are illustrative only, not actual factory measurements or operating results.'
              )
            : t(
                'Actual reports include only recorded inputs and non-demo records saved in this browser. Missing measurements remain unavailable; demo records are excluded.'
              )}
        </p>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-line bg-navy-900/60 p-1">
          {(['demo', 'actual'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setDataMode(mode)}
              aria-pressed={dataMode === mode}
              className={cx(
                'rounded-md px-3 py-1.5 text-[11px] font-semibold transition-colors',
                dataMode === mode
                  ? mode === 'demo'
                    ? 'bg-amber-400/15 text-amber-200'
                    : 'bg-sky-400/15 text-sky-200'
                  : 'text-ink-faint hover:text-ink'
              )}
            >
              {t(mode === 'demo' ? 'Demo data' : 'Actual data')}
            </button>
          ))}
        </div>
      </div>
      {/* Filters + export */}
      <div className="panel flex flex-col gap-3 p-3.5 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap rounded-xl border border-line bg-navy-900/50 p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(r.key)}
                className={cx(
                  'rounded-lg px-3 py-1.5 text-[11.5px] font-semibold transition-all',
                  range === r.key
                    ? 'bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/30'
                    : 'text-ink-faint hover:text-ink'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="input h-9 w-[142px] text-[12px]"
              />
              <span className="text-ink-faint">→</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="input h-9 w-[142px] text-[12px]"
              />
            </div>
          )}
          <SelectInput
            value={machineFilter}
            onChange={(e) => setMachineFilter(e.target.value)}
            className="h-9 w-full max-w-[220px] text-[12px] sm:w-auto"
          >
            <option value="All">All Machines</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id} — {m.type}
              </option>
            ))}
          </SelectInput>
          <span className="hidden items-center gap-1.5 text-[11px] text-ink-faint sm:inline-flex">
            <CalendarRange className="h-3.5 w-3.5" />
            {rangeLabel}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => exportReport('PDF')}
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={() => exportReport('Excel')}
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            type="button"
            className="btn-primary btn-sm"
            onClick={() => exportReport('CSV')}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          label={isDemoMode ? t('Demo Avg. Model Health Score') : t('Avg. Health Score')}
          value={predictedMachines.length ? `${kpis.avgHealth}%` : '—'}
          icon={<Gauge className="h-4 w-4" />}
          tone={
            !predictedMachines.length
              ? 'gray'
              : healthTone(kpis.avgHealth) === 'ok'
                ? 'green'
                : healthTone(kpis.avgHealth) === 'warn'
                  ? 'amber'
                  : 'red'
          }
          sub={
            isDemoMode
              ? t('Trained-model output calculated from simulated inputs.')
              : `${predictedMachines.length} ${t('current ML predictions')}`
          }
        />
        <KpiCard
          label={isDemoMode ? t('Demo Avg. Failure Risk') : t('Avg. Failure Risk')}
          value={predictedMachines.length ? `${kpis.avgRisk}%` : '—'}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={
            !predictedMachines.length
              ? 'gray'
              : riskTone(kpis.avgRisk) === 'ok'
                ? 'green'
                : riskTone(kpis.avgRisk) === 'warn'
                  ? 'amber'
                  : 'red'
          }
          sub={
            predictedMachines.length
              ? isDemoMode
                ? t('Illustrative model output; simulated inputs')
                : t('Model failure probability')
              : t('No eligible model predictions in this mode')
          }
        />
        <KpiCard
          label={
            isDemoMode
              ? t('Demo Avg. Sensor Anomaly Score')
              : t('Avg. Sensor Anomaly Score')
          }
          value={
            kpis.avgAnomalyScore === null
              ? '—'
              : `${(kpis.avgAnomalyScore * 100).toFixed(1)}%`
          }
          icon={<Activity className="h-4 w-4" />}
          tone={
            kpis.avgAnomalyScore === null
              ? 'gray'
              : kpis.avgAnomalyScore >= 0.7
                ? 'red'
                : kpis.avgAnomalyScore >= 0.4
                  ? 'amber'
                  : 'green'
          }
          sub={
            kpis.anomalyPredictionCount
              ? `${kpis.flaggedAnomalyPredictions}/${kpis.anomalyPredictionCount} ${t('current sensor-model predictions flagged')}`
              : t('No eligible model predictions in this mode')
          }
        />
        <KpiCard
          label={isDemoMode ? t('Demo Completed-Work Duration') : t('Total Downtime')}
          value={kpis.downtime === null ? 'N/A' : `${kpis.downtime.toFixed(1)} hrs`}
          icon={<Timer className="h-4 w-4" />}
          tone="amber"
          sub={
            kpis.downtime === null
              ? t(
                  isDemoMode
                    ? 'No completed sample durations in this period'
                    : 'No recorded actual downtime'
                )
              : t(
                  isDemoMode
                    ? 'Summed from completed demo work-order durations; not measured downtime'
                    : 'Completed work orders'
                )
          }
        />
        <KpiCard
          label={isDemoMode ? t('Demo Completed-Work Cost') : t('Maintenance Cost')}
          value={kpis.cost === null ? 'N/A' : `$${formatInt(kpis.cost)}`}
          icon={<Wrench className="h-4 w-4" />}
          tone="blue"
          sub={
            kpis.cost === null
              ? t(
                  isDemoMode
                    ? 'No completed sample costs in this period'
                    : 'No actual cost / downtime records'
                )
              : t(
                  isDemoMode
                    ? 'Summed from completed demo cost fields; not actual spend'
                    : 'Completed work orders'
                )
          }
        />
        <KpiCard
          label={isDemoMode ? t('Demo Quality Rate') : t('Quality Rate')}
          value={kpis.inspections ? `${kpis.qualityRate}%` : 'N/A'}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone={!kpis.inspections ? 'gray' : kpis.qualityRate >= 80 ? 'green' : 'amber'}
          sub={
            kpis.inspections
              ? `${kpis.passed}/${kpis.inspections} ${isDemoMode ? t('sample inspections passed') : t('inspections passed')}`
              : t('No inspection records')
          }
        />
      </div>
      <Panel className="overflow-hidden">
        <PanelHeader
          title={t('Operational Reliability Metrics')}
          subtitle={
            isDemoMode
              ? t(
                  'Demo duration and cost values below are calculated from sample completed work orders; they are not actual operating measurements or spend.'
                )
              : `${t('Reporting window')}: ${rangeLabel}`
          }
        />
        <div className="grid grid-cols-2 gap-2 px-4 pb-4 pt-3 sm:grid-cols-3 xl:grid-cols-5">
          {[
            [
              t(isDemoMode ? 'Demo MTBF' : 'MTBF'),
              kpis.operational.mtbfHours === null
                ? 'N/A'
                : `${kpis.operational.mtbfHours.toFixed(1)} h`,
              t(
                isDemoMode
                  ? `${t('Based on')} ${kpis.demoOperatingHours.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${t('assumed machine-hours (24/7)')} ${t('and')} ${kpis.demoFailureCount} ${t('sample failures')}.`
                  : 'Operating-hour exposure is not recorded'
              ),
            ],
            [
              t(isDemoMode ? 'Avg. Demo Work Duration' : 'MTTR'),
              kpis.operational.mttrHours === null
                ? 'N/A'
                : `${kpis.operational.mttrHours.toFixed(1)} h`,
              t(
                isDemoMode
                  ? 'Average of sample completed-work durations; not actual repair time'
                  : 'Uses actual downtime from completed work orders'
              ),
            ],
            [
              t(isDemoMode ? 'Demo Failure Rate' : 'Failure Rate'),
              kpis.operational.failureRate === null
                ? 'N/A'
                : isDemoMode
                  ? `${kpis.operational.failureRate.toFixed(2)} ${t('failures per 1,000 operating hours')}`
                  : `${kpis.operational.failureRate.toFixed(2)}%`,
              t(
                isDemoMode
                  ? `${kpis.demoFailureCount} ${t('sample failures')} / ${Math.round(kpis.demoOperatingHours).toLocaleString()} ${t('assumed machine-hours (24/7)')}.`
                  : 'Requires recorded failures and operating-hour exposure'
              ),
            ],
            [
              t(isDemoMode ? 'Demo Completed-Work Duration' : 'Actual Downtime'),
              kpis.operational.downtimeHours === null
                ? 'N/A'
                : `${kpis.operational.downtimeHours.toFixed(1)} h`,
              t(
                isDemoMode
                  ? 'Sum of sample durations; not measured downtime'
                  : 'Completed work orders with actual downtime'
              ),
            ],
            [
              t('Preventive Maintenance'),
              kpis.operational.preventiveMaintenancePercent === null
                ? 'N/A'
                : `${kpis.operational.preventiveMaintenancePercent.toFixed(1)}%`,
              t(
                isDemoMode
                  ? 'Preventive share calculated from classified sample work orders.'
                  : 'Requires classified work-order records'
              ),
            ],
          ].map(([label, value, note]) => (
            <div
              key={label}
              className="rounded-xl border border-line bg-navy-900/40 px-3 py-2.5"
            >
              <p className="text-[10px] text-ink-faint">{label}</p>
              <p className="mt-1 font-mono text-[14px] font-bold text-ink">{value}</p>
              <p className="mt-1 text-[9px] leading-snug text-ink-faint">{note}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* Analytics category tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={cx(
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[11.5px] font-semibold transition-all',
              section === s.key
                ? 'border-sky-400/30 bg-sky-500/10 text-sky-200'
                : 'border-line bg-navy-850 text-ink-faint hover:border-sky-400/20 hover:text-ink'
            )}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {!hasData && (
        <EmptyState
          title={t(
            isDemoMode
              ? 'No demo records in the selected window'
              : 'No actual records in the selected window'
          )}
          message={t(
            isDemoMode
              ? 'Try a wider date range or select All Machines to see the included sample records.'
              : 'No qualifying actual measurements or records are saved for this period. Add real readings or records; widening the date range will not create missing data.'
          )}
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {showHealth && (
          <ChartCard
            title={isDemoMode ? t('Demo Model Health Score') : t('Average Health Score')}
            subtitle={
              isCurrentSnapshotOnly
                ? t(
                    isDemoMode
                      ? 'Current trained-model output from simulated inputs; not a historical trend.'
                      : 'Current prediction snapshot in this window; not a historical trend.'
                  )
                : `${t('Fleet-average health')} · ${rangeLabel}`
            }
            right={
              <span className="chip font-mono text-emerald-300">
                <Activity className="h-3 w-3" />
                {predictedMachines.length
                  ? `${kpis.avgHealth}% ${isDemoMode ? t('demo snapshot') : t('now')}`
                  : t('No eligible predictions')}
              </span>
            }
          >
            {trendForCharts.length ? (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart
                  data={trendForCharts}
                  margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                >
                  <defs>
                    <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34D399" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={<ChartTooltip formatter={(v: number) => `${v}%`} />}
                  />
                  <Area
                    type="monotone"
                    dataKey="health"
                    name={t('Health score')}
                    stroke="#34D399"
                    strokeWidth={2}
                    fill="url(#healthFill)"
                    dot={trendForCharts.length < 2}
                    animationDuration={600}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No health history"
                message="Add a machine with historical data to build this trend."
              />
            )}
          </ChartCard>
        )}
        {showRisk && (
          <ChartCard
            title="Failure Risk Distribution"
            subtitle="Machines grouped by model-provided failure probability"
          >
            <ResponsiveContainer width="100%" height={230}>
              <BarChart
                data={riskDistribution}
                margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
              >
                <CartesianGrid strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="band" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="machines"
                  name="Machines"
                  radius={[6, 6, 0, 0]}
                  animationDuration={600}
                >
                  {riskDistribution.map((r) => (
                    <Cell key={r.band} fill={r.color} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {showRisk && (
          <ChartCard
            title={
              isCurrentSnapshotOnly
                ? t('Current Model Output Snapshot')
                : t('Model Output Trends')
            }
            subtitle={
              isCurrentSnapshotOnly
                ? isDemoMode
                  ? t(
                      'Current trained-model outputs from simulated inputs; not a historical trend.'
                    )
                  : t(
                      'Current failure-model, sensor-model and health-decision outputs; not a historical trend.'
                    )
                : t(
                    'Fleet-average failure probability, sensor anomaly score and combined health score'
                  )
            }
          >
            {trendForCharts.length ? (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart
                  data={trendForCharts}
                  margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
                >
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={<ChartTooltip formatter={(v: number) => `${v}%`} />}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9FB0C8' }} />
                  <Line
                    type="monotone"
                    dataKey="risk"
                    name="Failure risk"
                    stroke="#F87171"
                    strokeWidth={2}
                    dot={trendForCharts.length < 2}
                    animationDuration={600}
                  />
                  <Line
                    type="monotone"
                    dataKey="health"
                    name="Health score"
                    stroke="#60A5FA"
                    strokeWidth={1.6}
                    strokeDasharray="4 4"
                    dot={trendForCharts.length < 2}
                  />
                  <Line
                    type="monotone"
                    dataKey="anomaly"
                    name="Sensor anomaly score"
                    stroke="#FBBF24"
                    strokeWidth={1.8}
                    connectNulls
                    dot={trendForCharts.length < 2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No risk history"
                message="Simulated risk history appears for registered machines."
              />
            )}
          </ChartCard>
        )}

        {showDowntime && (
          <ChartCard
            title={
              isDemoMode
                ? t('Completed-Work Duration by Machine — Demo')
                : t('Recorded Actual Downtime')
            }
            subtitle={t(
              isDemoMode
                ? 'Sample durations parsed from completed demo work orders; not measured machine downtime.'
                : 'Hours from completed work-order records'
            )}
          >
            {downtimeByMachine.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={downtimeByMachine}
                  layout="vertical"
                  margin={{ top: 4, right: 18, bottom: 0, left: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 5" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="id"
                    tickLine={false}
                    axisLine={false}
                    width={54}
                  />
                  <Tooltip
                    content={<ChartTooltip formatter={(v: number) => `${v} hrs`} />}
                  />
                  <Bar
                    dataKey="hours"
                    name="Downtime (h)"
                    radius={[0, 6, 6, 0]}
                    animationDuration={600}
                  >
                    {downtimeByMachine.map((d) => (
                      <Cell
                        key={d.id}
                        fill={
                          d.hours >= 12 ? '#F87171' : d.hours >= 6 ? '#FBBF24' : '#60A5FA'
                        }
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title={t(
                  isDemoMode
                    ? 'No completed sample durations in this period'
                    : 'No downtime recorded'
                )}
                message={t(
                  isDemoMode
                    ? 'No completed demo work orders with a readable duration match this window.'
                    : 'No completed work orders with actual downtime recorded in this window.'
                )}
              />
            )}
          </ChartCard>
        )}
        {showMaintenance && (
          <ChartCard title="Maintenance Frequency" subtitle="Work orders per period">
            {maintenanceByMonth.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={maintenanceByMonth}
                  margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9FB0C8' }} />
                  <Bar
                    dataKey="orders"
                    name="Total orders"
                    fill="#60A5FA"
                    fillOpacity={0.7}
                    radius={[5, 5, 0, 0]}
                  />
                  <Bar
                    dataKey="completed"
                    name="Completed"
                    fill="#34D399"
                    fillOpacity={0.8}
                    radius={[5, 5, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No work orders"
                message="Schedule maintenance to populate this chart."
              />
            )}
          </ChartCard>
        )}

        {showMaintenance && (
          <ChartCard
            title={
              isDemoMode
                ? t('Sample Completed-Work Cost — Demo')
                : t('Actual Maintenance Cost')
            }
            subtitle={t(
              isDemoMode
                ? 'Sample cost fields from completed demo work orders; not actual expenditure.'
                : 'Recorded actual cost for completed work orders'
            )}
          >
            {maintenanceByMonth.some((record) => record.cost !== null) ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart
                  data={maintenanceByMonth}
                  margin={{ top: 8, right: 8, bottom: 0, left: -4 }}
                >
                  <defs>
                    <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    content={
                      <ChartTooltip formatter={(v: number) => `$${formatInt(v)}`} />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    name={isDemoMode ? t('Sample cost') : t('Actual cost')}
                    stroke="#60A5FA"
                    strokeWidth={2}
                    fill="url(#costFill)"
                    animationDuration={600}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title={t(
                  isDemoMode
                    ? 'No completed sample costs in this period'
                    : 'No actual cost data'
                )}
                message={t(
                  isDemoMode
                    ? 'No completed demo work orders with sample costs match this window.'
                    : 'Actual maintenance cost is unavailable until it is recorded at work-order completion.'
                )}
              />
            )}
          </ChartCard>
        )}

        {showMaintenance && (
          <ChartCard
            title="Maintenance by Type"
            subtitle="Most frequent work order categories"
          >
            {maintenanceByType.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={maintenanceByType}
                  layout="vertical"
                  margin={{ top: 4, right: 18, bottom: 0, left: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 5" horizontal={false} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickLine={false}
                    axisLine={false}
                    width={104}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="count"
                    name="Orders"
                    fill="#A78BFA"
                    fillOpacity={0.8}
                    radius={[0, 6, 6, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No work order types"
                message="Nothing scheduled in this window."
              />
            )}
          </ChartCard>
        )}
        {showQuality && (
          <ChartCard
            title="Quality Rate"
            subtitle="Pass vs. defect rate per inspection batch"
          >
            {qualityTrend.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart
                  data={qualityTrend}
                  margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={<ChartTooltip formatter={(v: number) => `${v}%`} />}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9FB0C8' }} />
                  <Line
                    type="monotone"
                    dataKey="qualityRate"
                    name={t(isDemoMode ? 'Demo quality rate' : 'Quality rate')}
                    stroke="#34D399"
                    strokeWidth={2}
                    dot={qualityTrend.length < 2}
                  />
                  <Line
                    type="monotone"
                    dataKey="defectRate"
                    name={t(isDemoMode ? 'Demo defect rate' : 'Defect rate')}
                    stroke="#F87171"
                    strokeWidth={2}
                    dot={qualityTrend.length < 2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No inspections"
                message="Run an inspection from the Quality page to populate this chart."
              />
            )}
          </ChartCard>
        )}

        {showQuality && (
          <ChartCard
            title="Defect Distribution"
            subtitle="Failed inspections grouped by defect type"
          >
            {defectDistribution.length ? (
              <div className="grid items-center gap-4 sm:grid-cols-[1fr_180px]">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={defectDistribution}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={52}
                      outerRadius={82}
                      paddingAngle={3}
                      animationDuration={600}
                    >
                      {defectDistribution.map((d, i) => (
                        <Cell
                          key={d.name}
                          fill={PIE_COLORS[i % PIE_COLORS.length]}
                          fillOpacity={0.85}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {defectDistribution.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-2 text-[11.5px]">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="min-w-0 flex-1 truncate text-ink-dim">
                        {d.name}
                      </span>
                      <span className="font-mono font-semibold text-ink">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                title="No defects detected"
                message="All inspections in this window passed."
              />
            )}
          </ChartCard>
        )}

        {showRisk && (
          <ChartCard
            title={isDemoMode ? t('Sample Event Trend') : t('Failure Trend')}
            subtitle={t(
              isDemoMode
                ? 'Counts from illustrative machine event records; not verified operating events or live model anomaly predictions.'
                : 'Recorded failure, anomaly and intervention events; model anomaly scores are reported separately.'
            )}
            className="xl:col-span-2"
          >
            {failureTrend.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={failureTrend}
                  margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                >
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    minTickGap={20}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9FB0C8' }} />
                  <Bar
                    dataKey="failures"
                    name={t(isDemoMode ? 'Sample failures' : 'Failures')}
                    stackId="ev"
                    fill="#F87171"
                    fillOpacity={0.85}
                  />
                  <Bar
                    dataKey="anomalies"
                    name={t(isDemoMode ? 'Sample sensor anomalies' : 'Sensor anomalies')}
                    stackId="ev"
                    fill="#FBBF24"
                    fillOpacity={0.8}
                  />
                  <Bar
                    dataKey="maintenance"
                    name={t(
                      isDemoMode
                        ? 'Sample maintenance / inspection'
                        : 'Maintenance / inspection'
                    )}
                    stackId="ev"
                    fill="#60A5FA"
                    fillOpacity={0.7}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title={t(
                  isDemoMode ? 'No sample events in this period' : 'No events recorded'
                )}
                message={t(
                  isDemoMode
                    ? 'No illustrative machine events match this date range.'
                    : 'Event markers appear here when machines log failures or sensor anomalies.'
                )}
              />
            )}
          </ChartCard>
        )}
      </div>

      {/* Machine-level analytics table */}
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-[13px] font-semibold text-ink">
              Machine Health Analytics
            </h3>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              Per-machine snapshot with current threshold classification applied
            </p>
          </div>
          <span className="chip font-mono">
            <Layers className="h-3 w-3" />
            {scopedMachines.length} rows
          </span>
        </div>
        {scopedMachines.length ? (
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line text-[10.5px] uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3 font-semibold">Machine</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">{t('Model Health')}</th>
                  <th className="px-3 py-3 font-semibold">Failure Risk</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Work Orders</th>
                  <th className="px-3 py-3 font-semibold">
                    {isDemoMode ? t('Sample Duration') : t('Actual Downtime')}
                  </th>
                  <th className="px-3 py-3 font-semibold">
                    {isDemoMode ? t('Sample Cost') : t('Actual Cost')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {scopedMachines.map((m) => {
                  const recs = maintenance.filter(
                    (r) =>
                      includesRecord(r.isDemo) && r.machineId === m.id && inRange(r.date)
                  )
                  const completed = recs.filter((record) => record.status === 'Completed')
                  const downtimeValues = completed
                    .map((record) =>
                      isDemoMode
                        ? durationHours(record.downtime)
                        : record.actualDowntimeHours
                    )
                    .filter(
                      (value): value is number =>
                        value !== null && value !== undefined && Number.isFinite(value)
                    )
                  const costValues = completed
                    .map((record) => (isDemoMode ? record.cost : record.actualCost))
                    .filter(
                      (value): value is number =>
                        value !== null && value !== undefined && Number.isFinite(value)
                    )
                  const hours = downtimeValues.reduce((sum, value) => sum + value, 0)
                  const cost = costValues.length
                    ? costValues.reduce((sum, value) => sum + value, 0)
                    : null
                  const hasPrediction = hasReportPrediction(m)
                  const reportHealth = reportHealthFor(m)
                  const reportStatus = reportStatusFor(m)
                  const hTone =
                    !hasPrediction || reportHealth === null
                      ? null
                      : healthTone(reportHealth)
                  const rTone =
                    !hasPrediction || m.failureRisk === null
                      ? null
                      : riskTone(m.failureRisk)
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-line/60 last:border-0 hover:bg-navy-800/40"
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11.5px] font-semibold text-ink">
                          {m.id}
                        </div>
                        <div className="text-[11px] text-ink-faint">{m.name}</div>
                      </td>
                      <td className="px-3 py-3 text-ink-dim">{m.type}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cx(
                            'font-mono font-semibold',
                            hTone === null
                              ? 'text-ink-faint'
                              : hTone === 'ok'
                                ? 'text-emerald-300'
                                : hTone === 'warn'
                                  ? 'text-amber-300'
                                  : 'text-red-300'
                          )}
                        >
                          {!hasPrediction || reportHealth === null
                            ? 'N/A'
                            : `${reportHealth}%`}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cx(
                            'font-mono font-semibold',
                            rTone === null
                              ? 'text-ink-faint'
                              : rTone === 'ok'
                                ? 'text-emerald-300'
                                : rTone === 'warn'
                                  ? 'text-amber-300'
                                  : 'text-red-300'
                          )}
                        >
                          {!hasPrediction || m.failureRisk === null
                            ? 'N/A'
                            : `${m.failureRisk.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] font-semibold',
                            reportStatus === null
                              ? 'border-line text-ink-faint'
                              : reportStatus === 'Operational'
                                ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                                : reportStatus === 'Warning'
                                  ? 'border-amber-400/25 bg-amber-500/10 text-amber-300'
                                  : reportStatus === 'Under Maintenance'
                                    ? 'border-sky-400/25 bg-sky-500/10 text-sky-300'
                                    : 'border-red-400/30 bg-red-500/10 text-red-300'
                          )}
                        >
                          {hasPrediction
                            ? (reportStatus ?? 'Unavailable')
                            : m.predictionStatus === 'loading'
                              ? 'Loading…'
                              : 'Unavailable'}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-ink-dim">{recs.length}</td>
                      <td className="px-3 py-3 font-mono text-ink-dim">
                        {downtimeValues.length ? `${hours.toFixed(1)} h` : 'N/A'}
                      </td>
                      <td className="px-3 py-3 font-mono text-ink-dim">
                        {cost === null ? 'N/A' : `$${formatInt(cost)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No machines match"
            message="Adjust the machine filter to see the analytics table."
          />
        )}
      </div>
    </div>
  )
}

const PIE_COLORS = ['#F87171', '#FBBF24', '#60A5FA', '#A78BFA', '#34D399', '#22D3EE']

const RANGE_DAYS: Record<Exclude<RangeKey, 'custom'>, number> = {
  '7d': 7,
  '30d': 30,
  '3m': 90,
}

function dayKey(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function shortMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
