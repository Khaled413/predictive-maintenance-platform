import React, { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CalendarPlus,
  History,
  MapPin,
  Settings2,
  Wrench,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../context/AppContext'
import MachineVisual from '../components/ui/MachineVisual'
import CircularHealth from '../components/ui/CircularHealth'
import RiskBar from '../components/ui/RiskBar'
import SensorList from '../components/ui/SensorList'
import { MachineStatusBadge, MaintenanceStatusBadge, PriorityBadge, MaintenanceRecordStatusBadge } from '../components/ui/Badges'
import Panel, { PanelHeader } from '../components/ui/Panel'
import { ChartCard, ChartTooltip } from '../components/ui/ChartCard'
import EmptyState from '../components/ui/EmptyState'
import Modal from '../components/ui/Modal'
import { Field, TextInput, SelectInput } from '../components/ui/Field'
import { cx, formatDate, formatInt } from '../utils/helpers'
import type { EventType } from '../types'

const EVENT_COLORS: Record<EventType, string> = {
  Maintenance: '#38BDF8',
  Inspection: '#34D399',
  'Sensor Anomaly': '#FBBF24',
  Failure: '#F87171',
}

export default function MachineDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const {
    machines,
    maintenance,
    updateMachine,
    addMaintenance,
    notify,
    refreshTimestamp,
  } = useApp()

  const machine = machines.find((m) => m.id === id)

  const status = machine?.prediction?.status ?? null
  const prediction = machine?.predictionStatus === 'available' ? machine.prediction : undefined
  const healthScore = prediction?.health_score ?? null
  const failureRisk = prediction ? prediction.failure_probability * 100 : null
  const recommendation = prediction?.recommendation ?? null
  const likelihood = prediction?.failure_type ?? null

  const machineMaintenance = useMemo(
    () =>
      maintenance
        .filter((r) => r.machineId === id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [maintenance, id],
  )

  const chartData = useMemo(() => {
    if (!machine) return []
    return machine.history.map((p) => ({
      ...p,
      short: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }))
  }, [machine])

  const eventPoints = useMemo(() => {
    if (!machine) return []
    const points: { x: string; type: EventType; note: string }[] = []
    for (const ev of machine.events) {
      const t = new Date(ev.date).getTime()
      let best = machine.history[0]
      let bestDiff = Infinity
      for (const p of machine.history) {
        const d = Math.abs(new Date(p.date).getTime() - t)
        if (d < bestDiff) {
          bestDiff = d
          best = p
        }
      }
      if (bestDiff < 3.5 * 86_400_000) points.push({ x: best.date, type: ev.type, note: ev.note })
    }
    return points
  }, [machine])

  const [scheduleOpen, setScheduleOpen] = React.useState(false)
  const [plan, setPlan] = React.useState({
    type: '',
    date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    technician: 'Ahmed H.',
    notes: '',
  })

  if (!machine) {
    return (
      <EmptyState
        title="Machine not found"
        message="The machine you are looking for does not exist or was removed."
        action={
          <button type="button" className="btn-primary" onClick={() => navigate('/machines')}>
            <ArrowLeft className="h-4 w-4" /> Back to Machines
          </button>
        }
      />
    )
  }

  const submitSchedule = () => {
    const nextId = `MT-${String(maintenance.length + 16).padStart(2, '0')}`
    addMaintenance({
      id: nextId,
      machineId: machine.id,
      machineName: machine.name,
      machineType: machine.type,
      type: plan.type || recommendation || 'Inspection',
      reason: likelihood || 'Scheduled maintenance',
      priority: status === 'Critical' ? 'High' : status === 'Warning' ? 'Medium' : 'Low',
      date: new Date(plan.date).toISOString(),
      technician: plan.technician,
      status: 'Scheduled',
      downtime: status === 'Critical' ? '8h' : '4h',
      cost: status === 'Critical' ? 2500 : 500,
      notes: plan.notes,
    })
    updateMachine(machine.id, { maintenanceStatus: 'Due Soon' })
    refreshTimestamp()
    notify('success', 'Maintenance scheduled', `${machine.id} · ${plan.type || recommendation || 'Inspection'} on ${formatDate(new Date(plan.date).toISOString())}.`)
    setScheduleOpen(false)
  }
return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/machines')}
          className="rounded-lg border border-line bg-navy-800/60 p-2 text-ink-dim transition-colors hover:border-sky-400/30 hover:text-sky-300"
          aria-label="Back to machines"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <MachineVisual type={machine.type} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-[16px] font-bold tracking-tight text-ink">
              {machine.id}
            </h2>
            <span className="rounded bg-navy-700/70 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-ink-dim">
              {machine.type}
            </span>
            {status ? (
              <MachineStatusBadge status={status} />
            ) : (
              <span className="text-[10px] text-ink-faint">
                {machine.predictionStatus === 'loading'
                  ? 'Prediction loading'
                  : machine.predictionError ?? 'ML prediction service unavailable'}
              </span>
            )}
            <MaintenanceStatusBadge status={machine.maintenanceStatus} />
          </div>
          <p className="mt-1 truncate text-[12px] text-ink-dim">
            {machine.name} · {machine.manufacturer} {machine.model}
          </p>
          <p className="mt-1 text-[10px] text-ink-faint">
            Model input type: {machine.modelTypeCode} · auto-mapped
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setScheduleOpen(true)}
            title="Schedule maintenance for this machine"
          >
            <CalendarPlus className="h-4 w-4" />
            Schedule Maintenance
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Panel className="flex items-center gap-4 p-4">
          {healthScore !== null ? (
            <CircularHealth value={healthScore} size={74} />
          ) : (
            <span className="max-w-20 text-center text-[10px] text-ink-faint">
              {machine.predictionStatus === 'loading'
                ? 'Loading…'
                : machine.predictionError ?? 'ML service unavailable'}
            </span>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Current Health Score
            </p>
            <p className="mt-1 text-[11.5px] text-ink-dim">
              {status === null
                ? machine.predictionStatus === 'loading'
                  ? 'Loading model output'
                  : machine.predictionError ?? 'ML prediction service unavailable'
                : status === 'Critical'
                ? 'Critical condition'
                : status === 'Warning'
                  ? 'Degraded condition'
                  : 'Healthy condition'}
            </p>
          </div>
        </Panel>
        <Panel className="p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
            Failure Probability
          </p>
          <p
            className={cx(
              'mt-2 font-mono text-[22px] font-bold',
              failureRisk === null ? 'text-ink-faint' : failureRisk >= 70
                ? 'text-red-300'
                : failureRisk >= 50
                  ? 'text-amber-300'
                  : 'text-emerald-300',
            )}
          >
            {failureRisk === null ? (machine.predictionStatus === 'loading' ? 'Loading…' : 'Unavailable') : `${failureRisk.toFixed(1)}%`}
          </p>
          <div className="mt-2.5">
            {failureRisk !== null && <RiskBar value={failureRisk} showLabel={false} />}
          </div>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-700/60 ring-1 ring-line">
              <MapPin className="h-4 w-4 text-ink-dim" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Location &amp; Install
            </p>
          </div>
          <p className="mt-2 text-[12px] font-medium text-ink-dim">{machine.location}</p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            Installed {formatDate(machine.installationDate)} · {machine.model}
          </p>
        </Panel>
        <Panel className="p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-700/60 ring-1 ring-line">
              <Wrench className="h-4 w-4 text-ink-dim" />
            </span>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
              Maintenance
            </p>
          </div>
          <p className="mt-2 text-[12px] font-medium text-ink-dim">
            Last {formatDate(machine.lastMaintenance)}
          </p>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            Next {formatDate(machine.nextMaintenance)}
          </p>
        </Panel>
      </div>
{/* Trend charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Health Score Over Time"
          subtitle="Stored successful model predictions with lifecycle events"
          right={
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(EVENT_COLORS).map(([label, color]) => (
                <span key={label} className="flex items-center gap-1.5 text-[9.5px] text-ink-faint">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          }
        >
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <defs>
                <linearGradient id="healthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#60A5FA" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#60A5FA" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,0.07)" vertical={false} />
              <XAxis
                dataKey="short"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                padding={{ left: 6, right: 6 }}
              />
              <YAxis domain={[0, 100]} tickCount={6} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}%`} />} />
              <Area
                type="monotone"
                dataKey="health"
                stroke="#60A5FA"
                strokeWidth={2.4}
                fill="url(#healthGrad)"
                dot={false}
                animationDuration={900}
              />
              {eventPoints.map((ev) => (
                <ReferenceDot
                  key={`${ev.type}-${ev.x}`}
                  x={ev.x}
                  y={machine.history.find((p) => p.date === ev.x)?.health ?? 50}
                  r={4.5}
                  fill={EVENT_COLORS[ev.type]}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Failure Probability Over Time" subtitle="Stored model probability outputs">
          <ResponsiveContainer width="100%" height={230}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
              <CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,0.07)" vertical={false} />
              <XAxis
                dataKey="short"
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                padding={{ left: 6, right: 6 }}
              />
              <YAxis domain={[0, 100]} tickCount={6} tickLine={false} axisLine={false} width={36} />
              <Tooltip content={<ChartTooltip formatter={(v: number) => `${v}%`} />} />
              <Line
                type="monotone"
                dataKey="risk"
                stroke="#FBBF24"
                strokeWidth={2.4}
                dot={false}
                animationDuration={900}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      {!chartData.length && (
        <p className="rounded-xl border border-line bg-navy-900/50 px-4 py-3 text-[11px] text-ink-faint">
          {machine.predictionStatus === 'loading'
            ? 'Loading model predictions; trend history will appear after the first successful response.'
            : `${machine.predictionError ?? 'ML prediction service unavailable.'} No model trend history is available.`}
        </p>
      )}
{/* Sensor history */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {machine.sensorHistory.slice(0, 4).map((series) => (
          <ChartCard
            key={series.name}
            title={series.name}
            subtitle={`Current ${machine.sensors.find((s) => s.name === series.name)?.value ?? '—'} ${series.unit} · range ${machine.sensors.find((s) => s.name === series.name)?.min ?? '—'}–${machine.sensors.find((s) => s.name === series.name)?.max ?? '—'} ${series.unit}`}
          >
            <ResponsiveContainer width="100%" height={150}>
              <LineChart
                data={series.data.map((p) => ({ ...p, short: new Date(p.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }))}
                margin={{ top: 6, right: 8, bottom: 4, left: -22 }}
              >
                <CartesianGrid strokeDasharray="3 5" stroke="rgba(148,163,184,0.06)" vertical={false} />
                <XAxis dataKey="short" tickLine={false} axisLine={false} hide />
                <YAxis tickLine={false} axisLine={false} width={40} />
                <Tooltip content={<ChartTooltip formatter={(v: number) => `${v} ${series.unit}`} />} />
                <Line type="monotone" dataKey="value" stroke="#60A5FA" strokeWidth={2} dot={false} animationDuration={700} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        ))}
      </div>

      {/* AI Analysis */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="overflow-hidden">
            <PanelHeader title="ML Prediction" subtitle="Trained model outputs · demo-mode simulated sensor inputs" />
            {prediction ? (
              <div className="grid gap-3 px-4 py-4 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-navy-900/50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Failure Type</p>
                  <p className="mt-1 text-[12px] font-semibold text-ink">
                    {prediction.failure_type ?? 'Not classified below threshold'}
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-navy-900/50 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Anomaly Score</p>
                  <p className="mt-1 text-[12px] font-semibold text-ink">{(prediction.anomaly_score * 100).toFixed(1)}% · {prediction.anomaly_flag ? 'Flagged' : 'Not flagged'}</p>
                </div>
                <div className="rounded-xl border border-line bg-navy-900/50 p-3 sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">Recommendation</p>
                  <p className="mt-1 text-[12px] font-semibold text-ink">{prediction.recommendation}</p>
                </div>
              </div>
            ) : (
              <p className="px-4 py-5 text-[12px] text-red-300">
                {machine.predictionStatus === 'loading'
                  ? 'Loading ML prediction…'
                  : `${machine.predictionError ?? 'ML prediction service unavailable.'} No model analysis is available.`}
              </p>
            )}
          </Panel>
        </div>

        {/* Sensor current state */}
        <Panel className="overflow-hidden">
          <PanelHeader title="Key Sensors · Current" subtitle="Live values vs safe band" />
          <div className="px-4 py-4">
            <SensorList sensors={machine.sensors} />
          </div>
        </Panel>
      </div>
{/* Histories */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <PanelHeader
            title="Maintenance History"
            subtitle={`${machineMaintenance.length} records`}
            right={<History className="h-4 w-4 text-ink-faint" />}
          />
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-navy-900/60 text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Technician</th>
                  <th className="px-3 py-2.5">Downtime</th>
                  <th className="px-3 py-2.5">Cost</th>
                </tr>
              </thead>
              <tbody>
                {machineMaintenance.slice(0, 7).map((r) => (
                  <tr key={r.id} className="border-b border-line/60 transition-colors hover:bg-navy-800/40">
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink-dim">
                      {formatDate(r.date)}
                    </td>
                    <td className="px-3 py-2.5 text-[11.5px] text-ink">{r.type}</td>
                    <td className="px-3 py-2.5 text-[11.5px] text-ink-dim">{r.technician}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink-dim">{r.downtime}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-ink-dim">
                      ${formatInt(r.cost)}
                    </td>
                  </tr>
                ))}
                {machineMaintenance.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-[12px] text-ink-faint">
                      No maintenance history recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
<Panel className="overflow-hidden">
          <PanelHeader title="Failure & Event History" subtitle="Sensor anomalies, inspections and failures" />
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-navy-900/60 text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Type</th>
                  <th className="px-3 py-2.5">Note</th>
                </tr>
              </thead>
              <tbody>
                {machine.events
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .map((ev) => (
                    <tr key={`${ev.type}-${ev.date}`} className="border-b border-line/60 transition-colors hover:bg-navy-800/40">
                      <td className="px-3 py-2.5 font-mono text-[11px] text-ink-dim">
                        {formatDate(ev.date)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold">
                          <span className="h-2 w-2 rounded-full" style={{ background: EVENT_COLORS[ev.type] }} />
                          <span style={{ color: EVENT_COLORS[ev.type] }}>{ev.type}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[11.5px] text-ink-dim">{ev.note}</td>
                    </tr>
                  ))}
                {machine.events.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-[12px] text-ink-faint">
                      No significant events in the monitoring window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
{/* Schedule maintenance modal */}
      <Modal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        title={`Schedule Maintenance — ${machine.id}`}
        subtitle="Create a new planned maintenance work order"
        size="md"
        footer={
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setScheduleOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={submitSchedule}>
              <CalendarPlus className="h-3.5 w-3.5" />
              Schedule
            </button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Maintenance Type">
            <TextInput
              value={plan.type || recommendation || ''}
              onChange={(e) => setPlan({ ...plan, type: e.target.value })}
              placeholder="e.g. Inspection"
            />
          </Field>
          <Field label="Date">
            <TextInput type="date" value={plan.date} onChange={(e) => setPlan({ ...plan, date: e.target.value })} />
          </Field>
          <Field label="Technician" className="sm:col-span-2">
            <SelectInput value={plan.technician} onChange={(e) => setPlan({ ...plan, technician: e.target.value })}>
              {['Ahmed H.', 'Sara M.', 'Khaled R.', 'Dina K.', 'Yousef A.', 'Omar S.', 'Mona T.', 'Hassan F.'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className="input h-20 resize-none py-2.5"
              value={plan.notes}
              onChange={(e) => setPlan({ ...plan, notes: e.target.value })}
              placeholder="Reason and special instructions for the team…"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}