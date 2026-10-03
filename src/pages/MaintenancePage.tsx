import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CalendarPlus,
  CheckCheck,
  Hammer,
  Pencil,
  Play,
  Search,
  Ban,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { PriorityBadge, MaintenanceRecordStatusBadge } from '../components/ui/Badges'
import { SelectInput, TextInput, Field } from '../components/ui/Field'
import Modal from '../components/ui/Modal'
import EmptyState from '../components/ui/EmptyState'
import { cx, formatDate, formatInt } from '../utils/helpers'
import type { MaintenancePriority, MaintenanceRecord, MaintenanceStatus } from '../types'

const TABS: { key: string; label: string }[] = [
  { key: 'Upcoming', label: 'Upcoming' },
  { key: 'Scheduled', label: 'Scheduled' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Cancelled', label: 'Cancelled' },
  { key: 'History', label: 'History' },
]

const EMPTY_FORM = {
  machineId: '',
  type: '',
  maintenanceKind: 'preventive' as 'preventive' | 'corrective' | '',
  priority: 'Medium' as MaintenancePriority,
  date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
  technician: 'Ahmed H.',
  downtime: '',
  cost: '',
  notes: '',
}

export default function MaintenancePage() {
  const { maintenance, machines, addMaintenance, updateMaintenance, transitionMaintenance, updateMachine, notify, refreshTimestamp } = useApp()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const [tab, setTab] = useState('Upcoming')
  const [search, setSearch] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('All')
  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [completionTarget, setCompletionTarget] = useState<MaintenanceRecord | null>(null)
  const [completion, setCompletion] = useState({ downtime: '', cost: '', failureCause: '', technician: '', notes: '' })

  useEffect(() => {
    const query = searchParams.get('search')
    if (query) {
      setSearch(query)
      setTab('History')
    }
    if (searchParams.get('create') === '1') openCreate()
    if (query || searchParams.has('create')) setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  const openCreate = () => {
    setEditId(null)
    setForm({ ...EMPTY_FORM, machineId: machines[0]?.id ?? '' })
    setFormOpen(true)
  }

  const openEdit = (r: MaintenanceRecord) => {
    setEditId(r.id)
    setForm({
      machineId: r.machineId,
      type: r.type,
      maintenanceKind: r.maintenanceKind ?? '',
      priority: r.priority,
      date: r.date.slice(0, 10),
      technician: r.technician,
      downtime: r.downtime,
      cost: r.cost === null ? '' : String(r.cost),
      notes: r.notes,
    })
    setFormOpen(true)
  }

  const filtered = useMemo(() => {
    let list = [...maintenance]
    if (tab === 'Upcoming') {
      list = list.filter((r) => r.status === 'Recommended' || r.status === 'Scheduled')
    } else if (tab === 'History') {
      list = list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    } else {
      list = list.filter((r) => r.status === tab)
    }
    if (priorityFilter !== 'All') list = list.filter((r) => r.priority === priorityFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter((r) =>
        `${r.machineId} ${r.machineName} ${r.type} ${r.reason} ${r.technician}`.toLowerCase().includes(q),
      )
    }
    return list
  }, [maintenance, tab, priorityFilter, search])

  const counts = useMemo(() => ({
    Upcoming: maintenance.filter((r) => r.status === 'Recommended' || r.status === 'Scheduled').length,
    Scheduled: maintenance.filter((r) => r.status === 'Scheduled').length,
    'In Progress': maintenance.filter((r) => r.status === 'In Progress').length,
    Completed: maintenance.filter((r) => r.status === 'Completed').length,
    Cancelled: maintenance.filter((r) => r.status === 'Cancelled').length,
  }), [maintenance])

  const submitForm = () => {
    if (!form.machineId || !form.type.trim()) {
      notify('warning', 'Required information missing', 'Select a machine and enter a maintenance type.')
      return
    }
    const estimatedCost = form.cost.trim() === '' ? null : Number(form.cost)
    if (estimatedCost !== null && (!Number.isFinite(estimatedCost) || estimatedCost < 0)) {
      notify('warning', 'Invalid estimated cost', 'Enter a non-negative value or leave the field blank.')
      return
    }
    const rec: MaintenanceRecord = {
      id: editId ?? `MT-${crypto.randomUUID()}`,
      machineId: form.machineId,
      machineName: machines.find((m) => m.id === form.machineId)?.name ?? form.machineId,
      machineType: machines.find((m) => m.id === form.machineId)?.type ?? '—',
      type: form.type,
      reason: 'Planned by maintenance planner',
      priority: form.priority,
      date: new Date(form.date).toISOString(),
      technician: form.technician,
      status: editId ? maintenance.find((r) => r.id === editId)?.status ?? 'Scheduled' : 'Scheduled',
      downtime: form.downtime.trim() || '—',
      cost: estimatedCost,
      notes: form.notes,
      maintenanceKind: form.maintenanceKind || undefined,
    }
    if (editId) {
      updateMaintenance(editId, rec)
      notify('info', 'Maintenance updated', `${rec.machineId} · ${rec.type}`)
    } else {
      addMaintenance(rec)
      notify('success', 'Maintenance scheduled', `${rec.machineId} · ${rec.type} on ${formatDate(rec.date)}.`)
    }
    setFormOpen(false)
  }

  const advance = (r: MaintenanceRecord, next: MaintenanceStatus) => {
    if (next === 'Completed') {
      setCompletionTarget(r)
      setCompletion({
        downtime: '',
        cost: '',
        failureCause: '',
        technician: r.technician === 'Unassigned' ? '' : r.technician,
        notes: '',
      })
      return
    }
    const changed = transitionMaintenance(r.id, next)
    if (!changed) {
      notify('warning', 'Status change not allowed', `${r.id} cannot move from ${r.status} to ${next}.`)
      return
    }
    if (next === 'Cancelled') {
      notify('info', 'Maintenance cancelled', `${r.machineId} · ${r.type}`)
    } else {
      notify('info', `Maintenance moved to “${next}”`, `${r.machineId} · ${r.type}`)
    }
    refreshTimestamp()
  }

  const completeWorkOrder = () => {
    if (!completionTarget) return
    const downtimeHours = Number(completion.downtime)
    const actualCost = completion.cost.trim() === '' ? null : Number(completion.cost)
    if (completion.downtime.trim() === '' || !Number.isFinite(downtimeHours) || downtimeHours < 0 ||
        (actualCost !== null && (!Number.isFinite(actualCost) || actualCost < 0))) {
      notify('warning', 'Check completion values', 'Enter non-negative actual downtime and actual cost.')
      return
    }
    const changed = transitionMaintenance(completionTarget.id, 'Completed', {
      actualDowntimeHours: downtimeHours,
      actualCost,
      failureCause: completion.failureCause.trim() || undefined,
      technician: completion.technician.trim() || completionTarget.technician,
      completionNotes: completion.notes.trim() || undefined,
    })
    if (!changed) {
      notify('warning', 'Status change not allowed', `${completionTarget.id} cannot be completed from ${completionTarget.status}.`)
      setCompletionTarget(null)
      return
    }
    const m = machines.find((x) => x.id === completionTarget.machineId)
    if (m) {
      updateMachine(m.id, {
        maintenanceStatus: 'On Schedule',
        lastMaintenance: new Date().toISOString(),
      })
    }
    notify('success', 'Maintenance completed', `${completionTarget.machineId} · ${completionTarget.type} completion details recorded.`)
    refreshTimestamp()
    setCompletionTarget(null)
  }
return (
    <div className="space-y-5">
    <div className="rounded-xl border border-sky-400/15 bg-sky-500/5 px-4 py-3 text-[10.5px] leading-relaxed text-ink-faint">
      Work orders are stored in this browser only; demo example records are labeled and excluded from actual downtime and cost KPIs. This is not a connected CMMS.
    </div>
    {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-line bg-navy-900/50 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cx(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-all',
                tab === t.key
                  ? 'bg-sky-500/15 text-sky-300'
                  : 'text-ink-dim hover:bg-navy-800 hover:text-ink',
              )}
            >
              {t.label}
              <span
                className={cx(
                  'rounded-md bg-navy-700/80 px-1.5 font-mono text-[9.5px]',
                  tab === t.key ? 'text-sky-300' : 'text-ink-faint',
                )}
              >
                {t.key === 'Upcoming' ? counts.Upcoming : (counts[t.key as keyof typeof counts] ?? 0)}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <button type="button" className="btn-primary" onClick={openCreate}>
            <CalendarPlus className="h-4 w-4" />
            Schedule Maintenance
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="panel flex flex-col gap-3 p-3.5 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <TextInput
            placeholder="Search by machine, type, reason or technician…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <SelectInput
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="w-auto min-w-36"
        >
          {['All', 'High', 'Medium', 'Low'].map((p) => (
            <option key={p} value={p}>
              {p === 'All' ? 'Priority: All' : p}
            </option>
          ))}
        </SelectInput>
        <span className="shrink-0 rounded-lg border border-line bg-navy-800/60 px-2.5 py-1.5 font-mono text-[11px] text-ink-dim">
          {filtered.length} records
        </span>
      </div>
{filtered.length === 0 ? (
        <EmptyState
          title={`No ${tab.toLowerCase()} maintenance records`}
          message="Schedule maintenance work to keep your machines healthy and production running."
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="thin-scroll overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead>
                <tr className="border-b border-line bg-navy-900/60 text-[9.5px] font-semibold uppercase tracking-wider text-ink-faint">
                  <th className="px-3 py-3">Machine</th>
                  <th className="px-3 py-3">Type / Reason</th>
                  <th className="px-3 py-3">Priority</th>
                  <th className="px-3 py-3">Date</th>
                  <th className="px-3 py-3">Technician</th>
                  <th className="px-3 py-3">Downtime</th>
                  <th className="px-3 py-3">Cost</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 transition-colors hover:bg-navy-800/40">
                    <td className="px-3 py-3">
                      <button type="button" onClick={() => navigate(`/machines/${r.machineId}`)} className="text-left">
                        <p className="font-mono text-[12px] font-bold text-ink hover:text-sky-300">{r.machineId}</p>
                        <p className="truncate text-[10.5px] text-ink-faint">{r.machineName}</p>
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-[11.5px] font-semibold text-ink">{r.type}</p>
                      <p className="truncate text-[10px] text-ink-faint">{r.reason}</p>
                    </td>
                    <td className="px-3 py-3">
                      <PriorityBadge priority={r.priority} />
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-ink-dim">{formatDate(r.date)}</td>
                    <td className="px-3 py-3 text-[11.5px] text-ink-dim">{r.technician}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-ink-dim">{r.downtime}</td>
                    <td className="px-3 py-3 font-mono text-[11px] text-ink-dim">
                      {r.cost === null ? '—' : `$${formatInt(r.cost)}`}
                    </td>
                    <td className="px-3 py-3">
                      <MaintenanceRecordStatusBadge status={r.status} />
                    </td>
<td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === 'Recommended' && (
                          <button
                            type="button"
                            title="Schedule this task"
                            onClick={() => advance(r, 'Scheduled')}
                            className="btn-ghost btn-sm"
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            Schedule
                          </button>
                        )}
                        {r.status === 'Scheduled' && (
                          <button
                            type="button"
                            title="Start work"
                            onClick={() => advance(r, 'In Progress')}
                            className="btn-ghost btn-sm"
                          >
                            <Play className="h-3.5 w-3.5" />
                            Start
                          </button>
                        )}
                        {r.status === 'In Progress' && (
                          <button
                            type="button"
                            title="Mark as completed"
                            onClick={() => advance(r, 'Completed')}
                            className="btn-primary btn-sm"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            Complete
                          </button>
                        )}
                        {['Recommended', 'Scheduled', 'In Progress'].includes(r.status) && (
                          <button
                            type="button"
                            title="Cancel work order"
                            onClick={() => {
                              if (window.confirm(`Cancel work order ${r.id}?`)) advance(r, 'Cancelled')
                            }}
                            className="btn-ghost btn-sm"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            Cancel
                          </button>
                        )}
                        <button
                          type="button"
                          title="Edit record"
                          onClick={() => openEdit(r)}
                          className="rounded-lg border border-line bg-navy-800/60 p-1.5 text-ink-dim transition-colors hover:border-sky-400/30 hover:text-sky-300"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
{/* Schedule / edit modal */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editId ? 'Edit Maintenance Work Order' : 'Schedule Maintenance'}
        subtitle="Plan preventive and corrective work for your fleet"
        size="lg"
        footer={
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setFormOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={submitForm}>
              <Hammer className="h-3.5 w-3.5" />
              {editId ? 'Save Changes' : 'Schedule Work'}
            </button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Machine">
            <SelectInput value={form.machineId} onChange={(e) => setForm({ ...form, machineId: e.target.value })}>
              {machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id} — {m.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Maintenance Type">
            <TextInput
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              placeholder="e.g. Inspection / Lubrication / Overhaul"
            />
          </Field>
          <Field label="Work Classification">
            <SelectInput
              value={form.maintenanceKind}
              onChange={(e) => setForm({ ...form, maintenanceKind: e.target.value as 'preventive' | 'corrective' | '' })}
            >
              <option value="">Not classified</option>
              <option value="preventive">Preventive</option>
              <option value="corrective">Corrective</option>
            </SelectInput>
          </Field>
          <Field label="Priority">
            <SelectInput value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as MaintenancePriority })}>
              {['Low', 'Medium', 'High'].map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Date">
            <TextInput type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>
          <Field label="Technician">
            <SelectInput value={form.technician} onChange={(e) => setForm({ ...form, technician: e.target.value })}>
              {['Ahmed H.', 'Sara M.', 'Khaled R.', 'Dina K.', 'Yousef A.', 'Omar S.', 'Mona T.', 'Hassan F.'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Estimated Downtime">
            <TextInput value={form.downtime} onChange={(e) => setForm({ ...form, downtime: e.target.value })} placeholder="e.g. 4h" />
          </Field>
          <Field label="Estimated Cost (USD)">
            <TextInput type="number" min="0" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} placeholder="Optional estimate" />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <textarea
              className="input h-20 resize-none py-2.5"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Work scope, parts needed, safety notes…"
            />
          </Field>
        </div>
      </Modal>
      <Modal
        open={completionTarget !== null}
        onClose={() => setCompletionTarget(null)}
        title={`Complete Work Order${completionTarget ? ` — ${completionTarget.id}` : ''}`}
        subtitle="Record actual work results; estimated values are kept separate."
        size="md"
        footer={
          <>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCompletionTarget(null)}>
              Cancel
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={completeWorkOrder}>
              <CheckCheck className="h-3.5 w-3.5" />
              Save Completion
            </button>
          </>
        }
      >
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field label="Actual Downtime (hours)">
            <TextInput
              type="number"
              required
              min="0"
              step="0.1"
              value={completion.downtime}
              onChange={(e) => setCompletion({ ...completion, downtime: e.target.value })}
              placeholder="Required"
            />
          </Field>
          <Field label="Actual Cost (USD)">
            <TextInput
              type="number"
              min="0"
              step="0.01"
              value={completion.cost}
              onChange={(e) => setCompletion({ ...completion, cost: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Technician">
            <TextInput
              value={completion.technician}
              onChange={(e) => setCompletion({ ...completion, technician: e.target.value })}
              placeholder="Technician name"
            />
          </Field>
          <Field label="Failure Cause">
            <TextInput
              value={completion.failureCause}
              onChange={(e) => setCompletion({ ...completion, failureCause: e.target.value })}
              placeholder="Optional"
            />
          </Field>
          <Field label="Completion Notes" className="sm:col-span-2">
            <textarea
              className="input h-20 resize-none py-2.5"
              value={completion.notes}
              onChange={(e) => setCompletion({ ...completion, notes: e.target.value })}
              placeholder="Work performed and parts used"
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}