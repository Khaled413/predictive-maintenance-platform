import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarClock,
  Factory,
  Gauge,
  Search,
  Timer,
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import KpiCard from '../components/ui/KpiCard'
import MachineCard from '../components/machine/MachineCard'
import EmptyState from '../components/ui/EmptyState'
import { SelectInput, TextInput } from '../components/ui/Field'
import { deriveMachineStatus, healthTone } from '../utils/helpers'
import type { Machine } from '../types'

function parseDowntime(d: string): number {
  const n = parseFloat(d)
  return isNaN(n) ? 0 : n
}

export default function OverviewPage() {
  const { machines, maintenance, thresholds } = useApp()
  const navigate = useNavigate()

  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [search, setSearch] = useState('')

  const machinesWithStatus: Machine[] = useMemo(
    () =>
      machines.map((m) => ({
        ...m,
        status: m.status === 'Under Maintenance' ? m.status : deriveMachineStatus(m, thresholds),
      })),
    [machines, thresholds],
  )

  const kpis = useMemo(() => {
    const total = machinesWithStatus.length
    const atRisk = machinesWithStatus.filter(
      (m) => m.status === 'Critical' || m.status === 'Warning',
    ).length
    const upcoming = maintenance.filter((r) => {
      const d = new Date(r.date).getTime()
      const now = Date.now()
      return (
        (r.status === 'Scheduled' || r.status === 'Recommended') &&
        d >= now &&
        d <= now + 14 * 86_400_000
      )
    }).length
    const avgHealth = Math.round(
      machinesWithStatus.reduce((acc, m) => acc + m.healthScore, 0) / Math.max(1, total),
    )
    const downtime = maintenance
      .filter((r) => {
        const d = new Date(r.date).getTime()
        return (
          (r.status === 'Completed' || r.status === 'In Progress') &&
          d >= Date.now() - 7 * 86_400_000 &&
          d <= Date.now()
        )
      })
      .reduce((acc, r) => acc + parseDowntime(r.downtime), 0)
    return { total, atRisk, upcoming, avgHealth, downtime }
  }, [machinesWithStatus, maintenance])

  const types = useMemo(
    () => ['All', ...Array.from(new Set(machines.map((m) => m.type)))],
    [machines],
  )

  const filtered = machinesWithStatus.filter((m) => {
    if (typeFilter !== 'All' && m.type !== typeFilter) return false
    if (statusFilter !== 'All' && m.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = `${m.id} ${m.name} ${m.type} ${m.location}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
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
          label="Machines at Risk"
          value={kpis.atRisk}
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={kpis.atRisk > 0 ? 'red' : 'green'}
          delta={kpis.atRisk ? `${kpis.atRisk} need attention` : 'Fleet nominal'}
          onClick={() => navigate('/alerts')}
        />
        <KpiCard
          label="Upcoming Maintenance"
          value={kpis.upcoming}
          icon={<CalendarClock className="h-4 w-4" />}
          tone="amber"
          sub="Next 14 days"
          onClick={() => navigate('/maintenance')}
        />
        <KpiCard
          label="Avg. Health Score"
          value={`${kpis.avgHealth}%`}
          icon={<Gauge className="h-4 w-4" />}
          tone={
            healthTone(kpis.avgHealth) === 'ok'
              ? 'green'
              : healthTone(kpis.avgHealth) === 'warn'
                ? 'amber'
                : 'red'
          }
          sub={healthTone(kpis.avgHealth) === 'ok' ? 'Fleet healthy' : 'Monitor closely'}
          onClick={() => navigate('/reports')}
        />
        <KpiCard
          label="Total Downtime (7d)"
          value={`${kpis.downtime.toFixed(1)}h`}
          icon={<Timer className="h-4 w-4" />}
          tone="gray"
          sub="Maintenance + failures"
        />
      </div>

      {/* Filters */}
      <div className="panel flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <TextInput
            placeholder="Search by Machine ID, name or type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
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