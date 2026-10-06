import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, Plus, Search, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import AddMachineModal from '../components/machine/AddMachineModal'
import MachineVisual from '../components/ui/MachineVisual'
import { MachineStatusBadge, SimulatedPredictionBadge } from '../components/ui/Badges'
import { SelectInput, TextInput } from '../components/ui/Field'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import EmptyState from '../components/ui/EmptyState'
import { cx, healthTone } from '../utils/helpers'
import { formatDate } from '../utils/helpers'
import type { Machine } from '../types'

export default function MachinesPage() {
  const { machines, thresholds, deleteMachine, notify, refreshTimestamp } = useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [maintFilter, setMaintFilter] = useState('All')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null)

  useEffect(() => {
    const searchTerm = searchParams.get('search')
    if (searchTerm) setSearch(searchTerm)
    if (searchParams.get('add') === '1') {
      setAddOpen(true)
    }
    if (searchTerm || searchParams.has('add') || searchParams.has('upload')) {
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const derived = machines
  const types = useMemo(() => ['All', ...Array.from(new Set(machines.map((m) => m.type)))], [machines])
  const maintStatuses = useMemo(
    () => ['All', ...Array.from(new Set(machines.map((m) => m.maintenanceStatus)))],
    [machines],
  )

  const filtered = derived.filter((m) => {
    if (typeFilter !== 'All' && m.type !== typeFilter) return false
    if (statusFilter !== 'All' && m.status !== statusFilter) return false
    if (maintFilter !== 'All' && m.maintenanceStatus !== maintFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${m.id} ${m.name} ${m.type} ${m.location} ${m.manufacturer} ${m.model}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  const confirmDelete = () => {
    if (!deleteTarget) return
    deleteMachine(deleteTarget.id)
    refreshTimestamp()
    notify('warning', `${deleteTarget.id} removed`, `${deleteTarget.name} was deleted from the fleet.`)
    setDeleteTarget(null)
  }
const summary = useMemo(() => {
    const counts = { Operational: 0, Warning: 0, Critical: 0 }
    derived.forEach((m) => {
      const status = m.status
      if (status && status in counts) counts[status as keyof typeof counts]++
    })
    return counts
  }, [derived])

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip">Total · {machines.length}</span>
          <span className="chip border-emerald-400/25 bg-emerald-500/5 text-emerald-300">
            {summary.Operational} Operational
          </span>
          <span className="chip border-amber-400/25 bg-amber-500/5 text-amber-300">
            {summary.Warning} Warning
          </span>
          <span className="chip border-red-400/30 bg-red-500/5 text-red-300">
            {summary.Critical} Critical
          </span>
        </div>
        <div className="ml-auto">
          <button type="button" className="btn-primary" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Machine
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="panel flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <TextInput
            placeholder="Search machines, manufacturers, models…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <SelectInput value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="w-auto min-w-32">
            {types.map((t) => (
              <option key={t} value={t}>
                {t === 'All' ? 'Type: All' : t}
              </option>
            ))}
          </SelectInput>
          <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto min-w-32">
            {['All', 'Operational', 'Warning', 'Critical'].map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'Status: All' : s}
              </option>
            ))}
          </SelectInput>
          <SelectInput value={maintFilter} onChange={(e) => setMaintFilter(e.target.value)} className="w-auto min-w-36">
            {maintStatuses.map((s) => (
              <option key={s} value={s}>
                {s === 'All' ? 'Maintenance: All' : s}
              </option>
            ))}
          </SelectInput>
        </div>
      </div>
{filtered.length === 0 ? (
        <EmptyState
          title="No machines found"
          message="Adjust the filters or add a new machine to the fleet."
          action={
            <button type="button" className="btn-primary btn-sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              Add Machine
            </button>
          }
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-navy-900/60 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
                  <th className="px-4 py-3">Machine</th>
                  <th className="px-3 py-3">Model Status</th>
                  <th className="px-3 py-3">Model Health</th>
                  <th className="px-3 py-3">Failure Risk</th>
                  <th className="px-3 py-3">Last Maintenance</th>
                  <th className="px-3 py-3">Next Maintenance</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const displayedStatus = m.status
                  const displayedHealth = m.healthScore
                  const displayedHealthTone = displayedHealth === null ? null : healthTone(displayedHealth)
                  const displayedRiskTone = m.failureRisk === null
                    ? null
                    : m.failureRisk >= thresholds.riskCritical ? 'danger'
                      : m.failureRisk >= thresholds.riskWarning ? 'warn' : 'ok'
                  return (
                  <tr
                    key={m.id}
                    className="group cursor-pointer border-b border-line/60 transition-colors hover:bg-navy-800/40"
                    onClick={() => navigate(`/machines/${m.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <MachineVisual type={m.type} size={40} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-mono text-[12.5px] font-bold text-ink">
                            {m.id}
                            {m.custom && (
                              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-sky-300">
                                New
                              </span>
                            )}
                          </p>
                          <p className="truncate text-[11px] text-ink-dim">{m.name}</p>
                          <p className="truncate text-[10px] text-ink-faint">
                            {m.type} · {m.location}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {displayedStatus ? (
                        <div className="flex flex-col items-start gap-1">
                          <MachineStatusBadge status={displayedStatus} />
                          {m.predictionInputs.machine_input_source === 'simulated' &&
                            m.predictionInputs.sensor_input_source === 'simulated' && (
                              <SimulatedPredictionBadge />
                            )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-ink-faint">
                          {m.predictionStatus === 'loading'
                            ? 'Loading prediction…'
                            : m.predictionError ?? 'ML prediction service unavailable'}
                        </span>
                      )}
                    </td>
<td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={cx(
                            'font-mono text-[12px] font-bold',
                            displayedHealth === null ? 'text-ink-faint' : displayedHealthTone === 'ok'
                              ? 'text-emerald-300'
                              : displayedHealthTone === 'warn'
                                ? 'text-amber-300'
                                : 'text-red-300',
                          )}
                        >
                          {displayedHealth === null ? '—' : `${displayedHealth}%`}
                        </span>
                        <div className="h-1 w-14 overflow-hidden rounded-full bg-navy-700/70">
                          <div
                            className={cx(
                              'h-full rounded-full',
                              displayedHealth !== null && displayedHealthTone === 'ok'
                                ? 'bg-emerald-400'
                                : displayedHealth !== null && displayedHealthTone === 'warn'
                                  ? 'bg-amber-400'
                                  : 'bg-red-400',
                            )}
                            style={{ width: `${displayedHealth ?? 0}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="w-28">
                        <div className="mb-1 flex items-center justify-between">
                          {m.failureRisk !== null ? <span
                            className={cx(
                              'font-mono text-[11px] font-semibold',
                              displayedRiskTone === 'danger' ? 'text-red-300'
                                : displayedRiskTone === 'warn' ? 'text-amber-300' : 'text-emerald-300',
                            )}
                          >
                            {m.failureRisk.toFixed(1)}%
                          </span> : <span className="text-[10px] text-ink-faint">
                            {m.predictionStatus === 'loading'
                              ? 'Loading…'
                              : m.predictionError ?? 'Unavailable'}
                          </span>}
                        </div>
                        {m.failureRisk !== null && (
                          <div className="h-1.5 overflow-hidden rounded-full bg-navy-700/70">
                            <div
                              className={cx('h-full rounded-full',
                                displayedRiskTone === 'danger' ? 'bg-red-400'
                                  : displayedRiskTone === 'warn' ? 'bg-amber-400' : 'bg-emerald-400')}
                              style={{ width: `${m.failureRisk}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-ink-dim">
                      {formatDate(m.lastMaintenance)}
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-ink-dim">
                      {formatDate(m.nextMaintenance)}
                      {m.maintenanceStatus === 'Overdue' && (
                        <span className="mt-1 block font-sans text-[10px] font-semibold text-red-300">
                          Maintenance overdue
                        </span>
                      )}
                    </td>
<td className="px-3 py-3">
                      <div
                        className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          title="View machine"
                          onClick={() => navigate(`/machines/${m.id}`)}
                          className="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-navy-700 hover:text-sky-300"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Remove machine"
                          onClick={() => setDeleteTarget(m)}
                          className="rounded-lg p-1.5 text-ink-dim transition-colors hover:bg-red-500/15 hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddMachineModal open={addOpen} onClose={() => setAddOpen(false)} />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.id ?? ''}?`}
        message={`This will permanently remove ${deleteTarget?.name ?? 'this machine'}, its alerts and maintenance history from the fleet. This action cannot be undone.`}
        confirmLabel="Delete Machine"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}