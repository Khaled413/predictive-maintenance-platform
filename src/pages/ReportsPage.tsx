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

type RangeKey = '7d' | '30d' | '3m' | 'custom'
type SectionKey = 'overview' | 'health' | 'risk' | 'downtime' | 'maintenance' | 'quality'

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

  const [range, setRange] = useState<RangeKey>('30d')
  const [section, setSection] = useState<SectionKey>('overview')
  const [customFrom, setCustomFrom] = useState(
    new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10),
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
    () => (machineFilter === 'All' ? machines : machines.filter((m) => m.id === machineFilter)),
    [machines, machineFilter],
  )
  const predictedMachines = scopedMachines.filter(
    (machine) => machine.healthScore !== null && machine.failureRisk !== null,
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
      (r) => scopedIds.has(r.machineId) && inRange(r.date) && r.status !== 'Recommended',
    )
    const completed = records.filter((r) => r.status === 'Completed')
    const downtime = records.reduce((a, r) => a + parseDowntime(r.downtime), 0)
    const cost = completed.reduce((a, r) => a + r.cost, 0)
    const insp = inspections.filter((i) => inRange(i.timestamp))
    const passed = insp.filter((i) => i.result === 'PASS').length
    const avgHealth = Math.round(
      predictedMachines.reduce((a, m) => a + (m.healthScore ?? 0), 0) /
        Math.max(1, predictedMachines.length),
    )
    const avgRisk = Math.round(
      predictedMachines.reduce((a, m) => a + (m.failureRisk ?? 0), 0) /
        Math.max(1, predictedMachines.length),
    )
    const avgMttr = completed.length
      ? (completed.reduce((a, r) => a + parseDowntime(r.downtime), 0) / completed.length).toFixed(1)
      : '0'
    return {
      avgHealth,
      avgRisk,
      downtime,
      cost,
      avgMttr,
      workOrders: records.length,
      qualityRate: insp.length ? Math.round((passed / insp.length) * 100) : 0,
      inspections: insp.length,
      passed,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedMachines, maintenance, inspections, start, end])

  /** Fleet-average health & risk trend for the active window. */
  const healthTrend = useMemo(() => {
    const buckets = new Map<string, { health: number[]; risk: number[] }>()
    scopedMachines.forEach((m) => {
      m.history.forEach((p) => {
        if (!inRange(p.date)) return
        const key = dayKey(p.date)
        const b = buckets.get(key) ?? { health: [], risk: [] }
        b.health.push(p.health)
        b.risk.push(p.risk)
        buckets.set(key, b)
      })
    })
    return Array.from(buckets.entries())
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([key, b]) => ({
        day: shortDay(key),
        health: Math.round(b.health.reduce((x, y) => x + y, 0) / b.health.length),
        risk: Math.round(b.risk.reduce((x, y) => x + y, 0) / b.risk.length),
      }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedMachines, start, end])

  const riskDistribution = useMemo(
    () =>
      RISK_BANDS.map((band) => ({
        band: band.label,
        machines:         predictedMachines.filter(
              (m) => m.failureRisk !== null && m.failureRisk >= band.min && m.failureRisk <= band.max,
        ).length,
        color: band.color,
      })),
    [scopedMachines],
  )

  const downtimeByMachine = useMemo(
    () =>
      scopedMachines
        .map((m) => {
          const recs = maintenance.filter(
            (r) => r.machineId === m.id && inRange(r.date) && r.status !== 'Recommended',
          )
          return {
            id: m.id,
            type: m.type,
            hours: Number(recs.reduce((a, r) => a + parseDowntime(r.downtime), 0).toFixed(1)),
          }
        })
        .filter((r) => r.hours > 0)
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 8),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scopedMachines, maintenance, start, end],
  )

  const maintenanceByMonth = useMemo(() => {
    const buckets = new Map<string, { orders: number; completed: number; cost: number }>()
    maintenance.forEach((r) => {
      if (!inRange(r.date)) return
      const key = shortMonth(r.date)
      const b = buckets.get(key) ?? { orders: 0, completed: 0, cost: 0 }
      b.orders += 1
      if (r.status === 'Completed') {
        b.completed += 1
        b.cost += r.cost
      }
      buckets.set(key, b)
    })
    return Array.from(buckets.entries()).map(([month, v]) => ({
      month,
      orders: v.orders,
      completed: v.completed,
      cost: v.cost,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenance, start, end])

  const maintenanceByType = useMemo(() => {
    const counts = new Map<string, number>()
    maintenance.forEach((r) => {
      if (!inRange(r.date)) return
      counts.set(r.type, (counts.get(r.type) ?? 0) + 1)
    })
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maintenance, start, end])

  const qualityTrend = useMemo(() => {
    const buckets = new Map<string, { total: number; passed: number }>()
    inspections.forEach((i) => {
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
  }, [inspections, start, end])

  const defectDistribution = useMemo(() => {
    const counts = new Map<string, number>()
    inspections
      .filter((i) => inRange(i.timestamp) && i.result === 'FAIL')
      .forEach((i) => counts.set(i.defectType, (counts.get(i.defectType) ?? 0) + 1))
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspections, start, end])

  /** Recorded failures / anomalies / interventions from machine event markers. */
  const failureTrend = useMemo(() => {
    const buckets = new Map<string, { failures: number; anomalies: number; maintenance: number }>()
    scopedMachines.forEach((m) => {
      m.events.forEach((e) => {
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
  }, [scopedMachines, start, end])

  const simulateExport = (kind: 'PDF' | 'Excel' | 'CSV') => {
    notify(
      'info',
      `Preparing ${kind} export…`,
      `${rangeLabel} · ${scopedMachines.length} machines · ${kpis.workOrders} work orders`,
    )
    window.setTimeout(() => {
      notify(
        'success',
        `${kind} export ready`,
        `Reports_${range}.${kind === 'Excel' ? 'xlsx' : kind.toLowerCase()} — prototype export (no file is written).`,
      )
    }, 1400)
  }

  const showHealth = section === 'overview' || section === 'health' || section === 'risk'
  const showRisk = section === 'overview' || section === 'risk'
  const showDowntime = section === 'overview' || section === 'downtime'
  const showMaintenance = section === 'overview' || section === 'maintenance'
  const showQuality = section === 'overview' || section === 'quality'
  const hasData = kpis.workOrders > 0 || kpis.inspections > 0 || healthTrend.length > 0
  return (
    <div className="space-y-5">
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
                    : 'text-ink-faint hover:text-ink',
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
          <button type="button" className="btn-ghost btn-sm" onClick={() => simulateExport('PDF')}>
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => simulateExport('Excel')}>
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => simulateExport('CSV')}>
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Avg. Health Score"
          value={predictedMachines.length ? `${kpis.avgHealth}%` : '—'}
          icon={<Gauge className="h-4 w-4" />}
          tone={!predictedMachines.length ? 'gray' :
            healthTone(kpis.avgHealth) === 'ok'
              ? 'green'
              : healthTone(kpis.avgHealth) === 'warn'
                ? 'amber'
                : 'red'}
          sub={`${predictedMachines.length} current ML predictions`}
        />
        <KpiCard
          label="Avg. Failure Risk"
          value={predictedMachines.length ? `${kpis.avgRisk}%` : '—'}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={!predictedMachines.length ? 'gray' :
            riskTone(kpis.avgRisk) === 'ok' ? 'green' : riskTone(kpis.avgRisk) === 'warn' ? 'amber' : 'red'
          }
          sub={predictedMachines.length ? 'Model failure probability' : 'ML prediction service unavailable'}
        />
        <KpiCard
          label="Total Downtime"
          value={`${kpis.downtime.toFixed(1)} hrs`}
          icon={<Timer className="h-4 w-4" />}
          tone="amber"
          sub={`${kpis.workOrders} work orders`}
        />
        <KpiCard
          label="Maintenance Cost"
          value={`$${formatInt(kpis.cost)}`}
          icon={<Wrench className="h-4 w-4" />}
          tone="blue"
          sub={`Avg. MTTR ${kpis.avgMttr} h`}
        />
        <KpiCard
          label="Quality Rate"
          value={`${kpis.qualityRate}%`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          tone={kpis.qualityRate >= 80 ? 'green' : 'amber'}
          sub={`${kpis.passed}/${kpis.inspections} inspections passed`}
        />
      </div>

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
                : 'border-line bg-navy-850 text-ink-faint hover:border-sky-400/20 hover:text-ink',
            )}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>

      {!hasData && (
        <EmptyState
          title="No data in the selected window"
          message="Widen the date range or clear the machine filter to see analytics for this period."
        />
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {showHealth && (
          <ChartCard
            title="Average Health Score"
            subtitle={`Fleet-average health · ${rangeLabel}`}
            right={
              <span className="chip font-mono text-emerald-300">
                <Activity className="h-3 w-3" />
                {predictedMachines.length ? `${kpis.avgHealth}% now` : 'ML prediction service unavailable'}
              </span>
            }
          >
            {healthTrend.length ? (
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={healthTrend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="healthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34D399" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#34D399" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}%`} />} />
                  <Area
                    type="monotone"
                    dataKey="health"
                    name="Health score"
                    stroke="#34D399"
                    strokeWidth={2}
                    fill="url(#healthFill)"
                    dot={false}
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
              <BarChart data={riskDistribution} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                <CartesianGrid strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="band" tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="machines" name="Machines" radius={[6, 6, 0, 0]} animationDuration={600}>
                  {riskDistribution.map((r) => (
                    <Cell key={r.band} fill={r.color} fillOpacity={0.75} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {showRisk && (
          <ChartCard title="Failure Risk Trend" subtitle="Fleet-average predicted risk vs. health score">
            {healthTrend.length ? (
              <ResponsiveContainer width="100%" height={230}>
                <LineChart data={healthTrend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9FB0C8' }} />
                  <Line
                    type="monotone"
                    dataKey="risk"
                    name="Failure risk"
                    stroke="#F87171"
                    strokeWidth={2}
                    dot={false}
                    animationDuration={600}
                  />
                  <Line
                    type="monotone"
                    dataKey="health"
                    name="Health score"
                    stroke="#60A5FA"
                    strokeWidth={1.6}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No risk history" message="Simulated risk history appears for registered machines." />
            )}
          </ChartCard>
        )}

        {showDowntime && (
          <ChartCard title="Downtime by Machine" subtitle="Hours of downtime in the selected window">
            {downtimeByMachine.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={downtimeByMachine}
                  layout="vertical"
                  margin={{ top: 4, right: 18, bottom: 0, left: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 5" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="id" tickLine={false} axisLine={false} width={54} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} hrs`} />} />
                  <Bar dataKey="hours" name="Downtime (h)" radius={[0, 6, 6, 0]} animationDuration={600}>
                    {downtimeByMachine.map((d) => (
                      <Cell
                        key={d.id}
                        fill={d.hours >= 12 ? '#F87171' : d.hours >= 6 ? '#FBBF24' : '#60A5FA'}
                        fillOpacity={0.8}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No downtime recorded"
                message="No completed or in-progress work orders in this window."
              />
            )}
          </ChartCard>
        )}
        {showMaintenance && (
          <ChartCard title="Maintenance Frequency" subtitle="Work orders per period">
            {maintenanceByMonth.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={maintenanceByMonth} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
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
              <EmptyState title="No work orders" message="Schedule maintenance to populate this chart." />
            )}
          </ChartCard>
        )}

        {showMaintenance && (
          <ChartCard title="Maintenance Cost" subtitle="Spend against completed work orders">
            {maintenanceByMonth.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={maintenanceByMonth} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                  <defs>
                    <linearGradient id="costFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `$${formatInt(v)}`} />} />
                  <Area
                    type="monotone"
                    dataKey="cost"
                    name="Cost"
                    stroke="#60A5FA"
                    strokeWidth={2}
                    fill="url(#costFill)"
                    animationDuration={600}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No cost data" message="Complete a work order to see cost analytics." />
            )}
          </ChartCard>
        )}

        {showMaintenance && (
          <ChartCard title="Maintenance by Type" subtitle="Most frequent work order categories">
            {maintenanceByType.length ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart
                  data={maintenanceByType}
                  layout="vertical"
                  margin={{ top: 4, right: 18, bottom: 0, left: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 5" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={104} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Orders" fill="#A78BFA" fillOpacity={0.8} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState title="No work order types" message="Nothing scheduled in this window." />
            )}
          </ChartCard>
        )}
        {showQuality && (
          <ChartCard title="Quality Rate" subtitle="Pass vs. defect rate per inspection batch">
            {qualityTrend.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={qualityTrend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}%`} />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9FB0C8' }} />
                  <Line type="monotone" dataKey="qualityRate" name="Quality rate" stroke="#34D399" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="defectRate" name="Defect rate" stroke="#F87171" strokeWidth={2} dot={false} />
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
          <ChartCard title="Defect Distribution" subtitle="Failed inspections grouped by defect type">
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
                        <Cell key={d.name} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={0.85} />
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
                      <span className="min-w-0 flex-1 truncate text-ink-dim">{d.name}</span>
                      <span className="font-mono font-semibold text-ink">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState title="No defects detected" message="All inspections in this window passed." />
            )}
          </ChartCard>
        )}

        {showRisk && (
          <ChartCard
            title="Failure Trend"
            subtitle="Recorded failures, sensor anomalies and interventions"
            className="xl:col-span-2"
          >
            {failureTrend.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={failureTrend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 5" vertical={false} />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} minTickGap={20} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#9FB0C8' }} />
                  <Bar dataKey="failures" name="Failures" stackId="ev" fill="#F87171" fillOpacity={0.85} />
                  <Bar dataKey="anomalies" name="Sensor anomalies" stackId="ev" fill="#FBBF24" fillOpacity={0.8} />
                  <Bar
                    dataKey="maintenance"
                    name="Maintenance / inspection"
                    stackId="ev"
                    fill="#60A5FA"
                    fillOpacity={0.7}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState
                title="No events recorded"
                message="Event markers appear here when machines log failures or sensor anomalies."
              />
            )}
          </ChartCard>
        )}
      </div>

      {/* Machine-level analytics table */}
      <div className="panel overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-line px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h3 className="text-[13px] font-semibold text-ink">Machine Health Analytics</h3>
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
                  <th className="px-3 py-3 font-semibold">Health</th>
                  <th className="px-3 py-3 font-semibold">Failure Risk</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Work Orders</th>
                  <th className="px-3 py-3 font-semibold">Downtime</th>
                  <th className="px-3 py-3 font-semibold">Cost</th>
                </tr>
              </thead>
              <tbody>
                {scopedMachines.map((m) => {
                  const recs = maintenance.filter((r) => r.machineId === m.id && inRange(r.date))
                  const hours = recs.reduce((a, r) => a + parseDowntime(r.downtime), 0)
                  const cost = recs
                    .filter((r) => r.status === 'Completed')
                    .reduce((a, r) => a + r.cost, 0)
                  const hTone = m.healthScore === null ? null : healthTone(m.healthScore)
                  const rTone = m.failureRisk === null ? null : riskTone(m.failureRisk)
                  return (
                    <tr key={m.id} className="border-b border-line/60 last:border-0 hover:bg-navy-800/40">
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11.5px] font-semibold text-ink">{m.id}</div>
                        <div className="text-[11px] text-ink-faint">{m.name}</div>
                      </td>
                      <td className="px-3 py-3 text-ink-dim">{m.type}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cx(
                            'font-mono font-semibold',
                            hTone === null ? 'text-ink-faint' : hTone === 'ok'
                              ? 'text-emerald-300'
                              : hTone === 'warn'
                                ? 'text-amber-300'
                                : 'text-red-300',
                          )}
                        >
                          {m.healthScore === null ? '—' : `${m.healthScore}%`}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cx(
                            'font-mono font-semibold',
                            rTone === null ? 'text-ink-faint' : rTone === 'ok'
                              ? 'text-emerald-300'
                              : rTone === 'warn'
                                ? 'text-amber-300'
                                : 'text-red-300',
                          )}
                        >
                          {m.failureRisk === null ? '—' : `${m.failureRisk.toFixed(1)}%`}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cx(
                            'inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10.5px] font-semibold',
                            m.status === null
                              ? 'border-line text-ink-faint'
                              : m.status === 'Operational'
                              ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300'
                              : m.status === 'Warning'
                                ? 'border-amber-400/25 bg-amber-500/10 text-amber-300'
                                : m.status === 'Under Maintenance'
                                  ? 'border-sky-400/25 bg-sky-500/10 text-sky-300'
                                  : 'border-red-400/30 bg-red-500/10 text-red-300',
                          )}
                        >
                          {m.status ?? (m.predictionStatus === 'loading' ? 'Loading…' : 'Unavailable')}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-ink-dim">{recs.length}</td>
                      <td className="px-3 py-3 font-mono text-ink-dim">{hours.toFixed(1)} h</td>
                      <td className="px-3 py-3 font-mono text-ink-dim">${formatInt(cost)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No machines match" message="Adjust the machine filter to see the analytics table." />
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

function parseDowntime(d: string): number {
  const n = parseFloat(d)
  return isNaN(n) ? 0 : n
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
